import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { claudeEnabled, claudeModel } from "./claude";
import type { EvidenceBundle } from "./evidence";
import { items, parseMedGuide, sentencesMatching, splitSideEffects } from "./medguide";
import { firstSentences, truncate } from "./text";
import type { MedlinePlusEntry } from "./sources/medlineplus";
import type { GradeLevel } from "./types";

/** Plain-language content for the patient view and printable handout, in the order a patient reads it. */
export interface PlainLanguage {
  mode: "ai" | "guide" | "basic";
  whatItIsFor: string;
  /** The single most important safety message, when the label has one. */
  mostImportant?: string;
  howItWorks?: string;
  howToTake: string[];
  missedDose?: string;
  whatToExpect?: string;
  benefits: string[];
  commonSideEffects: string[];
  /** Serious side effects to report to the doctor soon. */
  callDoctor: string[];
  /** Signs that need emergency help (call 911). */
  call911: string[];
  whoShouldNot: string[];
  /** Medicines, foods, drinks and activities to avoid or check first. */
  avoid: string[];
  pregnancy?: string;
  storage: string[];
  drawbacks: string[];
  questions: string[];
}

const PATIENT_GRADE: Record<GradeLevel, string> = {
  high: "Strong research supports how well this medicine works for this use.",
  moderate: "Good research supports this use, but future studies could change what we know.",
  low: "Only limited research supports this use so far.",
  "very-low": "There is very little research on this use, mostly reports about single patients.",
  insufficient: "This use has not been studied in published research yet.",
  "needs-condition": "Ask your doctor how strong the research is for your condition.",
};

const STANDARD_QUESTIONS = [
  "Why is this medicine a good choice for me?",
  "How long until it starts to work, and how will we know it is working?",
  "Which side effects should I call you about?",
  "Can I take it with my other medicines and supplements?",
  "What should I do if I miss a dose?",
];

const ALLERGY_911 = "Trouble breathing, swelling of your face, lips, tongue or throat, or a severe rash: these can be signs of a serious allergic reaction.";

const STORAGE_DEFAULT = [
  "Keep it in its original container, at room temperature, away from heat and moisture (not in the bathroom), unless the label says otherwise.",
  "Keep all medicines out of the reach of children and pets.",
  "To throw away unused medicine, use a drug take-back site or follow the FDA's disposal advice; do not flush it unless the label says to.",
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isOffLabel(e: EvidenceBundle): boolean {
  return e.labelStatus.kind === "off-label" || e.labelStatus.kind === "limitation";
}

/**
 * The label's own list of most common side effects ("Most common adverse reactions (>5%) are
 * diarrhea, nausea/vomiting, ..."), split into items. Empty when the label does not state one.
 */
export function commonSideEffectsFromLabel(text: string | undefined): string[] {
  if (!text) return [];
  const m = text.match(/most common adverse (?:reactions|events)[^.:]*?(?:\([^)]*\))?[^.:]*?\b(?:are|were|include|included)\s*:?\s*([^.]+)/i);
  if (!m) return [];
  return m[1]
    .replace(/\([^)]*\)/g, "")
    .split(/,|;|\band\b/)
    .map((s) => s.replace(/^\s*(?:and|or)\s+/i, "").trim())
    .filter((s) => s.length > 2 && s.length < 60 && !/\d+\.\d|see |section/i.test(s))
    .slice(0, 8)
    .map((s) => capitalize(s));
}

/** Plain words for an FDA pharmacologic class: "Biguanide [EPC]" -> "a group of medicines called biguanides". */
function classSentence(drug: string, epc: string[] | undefined): string | undefined {
  const c = epc?.[0]?.replace(/\s*\[EPC\]$/, "");
  return c ? `${capitalize(drug)} belongs to a group of medicines called ${c.toLowerCase()}s.`.replace(/ss\.$/, "s.") : undefined;
}

/**
 * Without Claude: built from the FDA Medication Guide (written for patients) when the drug has one,
 * otherwise from the label's patient counseling section and facts already on the page.
 */
export function basicPlainLanguage(e: EvidenceBundle, medline: MedlinePlusEntry[]): PlainLanguage {
  const drug = capitalize(e.drug);
  const l = e.label;
  const guide = parseMedGuide(l?.medGuide);
  const hasGuide = Object.keys(guide).length >= 3;
  const counseling = l?.patientCounseling;

  let whatItIsFor: string;
  if (e.condition && isOffLabel(e)) {
    whatItIsFor = `Your doctor may prescribe ${drug} for ${e.condition}. This is called "off-label" use: the FDA approved ${drug} for other conditions, and doctors may prescribe it for this one when research and their judgement support it.`;
  } else if (e.condition && (e.labelStatus.kind === "approved" || e.labelStatus.kind === "likely-approved")) {
    whatItIsFor = `${drug} is approved by the FDA to treat ${e.condition}.${guide.whatIs ? ` ${truncate(firstSentences(guide.whatIs, 2), 400)}` : ""}`;
  } else if (guide.whatIs) {
    whatItIsFor = truncate(firstSentences(guide.whatIs, 3), 500);
  } else if (medline[0]?.summary) {
    whatItIsFor = firstSentences(medline[0].summary, 2);
  } else if (l?.otc?.purpose) {
    whatItIsFor = `${drug} is used as: ${l.otc.purpose}`;
  } else {
    whatItIsFor = l ? truncate(firstSentences(l.indications, 1), 300) : `${drug} is a prescription medicine.`;
  }

  const sides = splitSideEffects(guide.sideEffects);
  const common = sides.common.length ? sides.common : commonSideEffectsFromLabel(l?.adverseReactions);
  const call911 = [...sides.call911];
  if (!call911.some((s) => /allerg|breath/i.test(s))) call911.push(ALLERGY_911);
  const callDoctor = sides.callDoctor.length ? sides.callDoctor : l?.otc?.stopUse ? items(l.otc.stopUse, 6) : [];

  const mostImportant = guide.important
    ? truncate(firstSentences(guide.important, 2), 400)
    : l?.boxedWarning
      ? "This medicine has an FDA boxed warning, the strongest warning the FDA gives. Ask your doctor what it means for you."
      : undefined;

  const howToTake = items(guide.howToTake, 8);
  if (howToTake.length === 0 && l?.otc?.directions) howToTake.push(...items(l.otc.directions, 6));
  if (howToTake.length === 0) howToTake.push(`Take ${drug} exactly as your doctor tells you. Do not change your dose or stop taking it without talking to your doctor.`);

  const missed = sentencesMatching(`${guide.howToTake ?? ""} ${counseling ?? ""}`, /\bmiss(ed)?\b.*\bdose|forget to take/i, 2).join(" ");
  const pregnancy = sentencesMatching(`${guide.beforeTaking ?? ""} ${guide.important ?? ""}`, /pregnan|breastfe/i, 3).join(" ");

  const whoShouldNot = items(guide.whoShouldNot, 6);
  if (whoShouldNot.length === 0 && l?.otc?.doNotUse) whoShouldNot.push(...items(l.otc.doNotUse, 6));

  const avoid = items(guide.avoid, 6);
  if (l?.otc?.askDoctor) avoid.push(`Ask a doctor before use if you have: ${truncate(l.otc.askDoctor, 200)}`);
  avoid.push("Tell your doctor and pharmacist about every medicine, vitamin and supplement you take, so they can check for interactions.");

  const storage = guide.storage ? items(guide.storage, 5) : [...STORAGE_DEFAULT];
  if (guide.storage) storage.push(STORAGE_DEFAULT[2]);

  const drawbacks = ["Cost depends on your insurance. Ask your pharmacist about generic versions and discount programs."];
  if (e.condition && isOffLabel(e)) drawbacks.push("Insurance may not cover off-label use without a letter from your doctor.");

  return {
    mode: hasGuide ? "guide" : "basic",
    whatItIsFor,
    mostImportant,
    howItWorks: classSentence(e.drug, l?.pharmClassEpc),
    howToTake,
    missedDose: missed || undefined,
    benefits: [PATIENT_GRADE[e.grade.level]],
    commonSideEffects: common,
    callDoctor,
    call911: call911.slice(0, 6),
    whoShouldNot,
    avoid: avoid.slice(0, 7),
    pregnancy: pregnancy || undefined,
    storage,
    drawbacks,
    questions: e.condition && isOffLabel(e) ? [...STANDARD_QUESTIONS, "Will my insurance cover this off-label use?"] : STANDARD_QUESTIONS,
  };
}

const PlainSchema = z.object({
  whatItIsFor: z.string().describe("Two sentences: what the medicine is and why this patient may take it."),
  mostImportant: z.string().describe("The single most important safety message from the sources, in one or two sentences. Empty if none."),
  howItWorks: z.string().describe("One or two sentences, no jargon."),
  howToTake: z.array(z.string()).describe("Three to six short steps: when, with or without food, how (swallow whole, inject), and to follow the doctor's dose."),
  missedDose: z.string().describe("What to do about a missed dose, only if the sources say. Empty otherwise."),
  whatToExpect: z.string().describe("What improvement typically looks like and how long it takes, if the sources say. Empty otherwise."),
  benefits: z.array(z.string()).describe("Two to four benefits, honest about how strong the research is."),
  commonSideEffects: z.array(z.string()).describe("The most common side effects in everyday words, with how often if the label says."),
  callDoctor: z.array(z.string()).describe("Serious side effects to call the doctor about soon, in everyday words."),
  call911: z.array(z.string()).describe("Signs that need emergency help right away (call 911)."),
  whoShouldNot: z.array(z.string()).describe("Who should not take it, in everyday words."),
  avoid: z.array(z.string()).describe("Medicines, foods, alcohol or activities to avoid or check with the doctor first."),
  pregnancy: z.string().describe("What the sources say about pregnancy and breastfeeding, in one to three sentences. Empty if nothing."),
  storage: z.array(z.string()).describe("How to store it and safely throw it away."),
  drawbacks: z.array(z.string()).describe("Practical drawbacks: monitoring, cost, interactions, time to work."),
  questions: z.array(z.string()).describe("Four or five questions the patient could ask their doctor."),
});

const PLAIN_SYSTEM = `You write patient handouts about prescription medicines in plain language at a 6th to 8th grade reading level.
Use only the facts in the sources provided. The FDA Medication Guide, when given, is the best source for patients: follow it closely.
Do not invent statistics, doses or outcomes. If a source does not say something, leave the field empty or say the doctor will explain.
Never tell the patient to change their dose. Use short sentences and everyday words, and explain any medical word you must use.
If the use is off-label, explain kindly what that means. Be honest about uncertainty in the research.`;

async function callClaudePlain(drug: string, condition: string | undefined, sources: string) {
  "use cache";
  cacheLife("days");
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: claudeModel(),
    max_tokens: 6000,
    system: PLAIN_SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(PlainSchema) },
    messages: [
      {
        role: "user",
        content: `Write a patient handout about ${drug}${condition ? ` for ${condition}` : ""}.\n\n${sources}`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`No patient summary returned (stop reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

function plainSources(e: EvidenceBundle, medline: MedlinePlusEntry[]): string {
  const l = e.label;
  const parts = [
    `Approval status for this use: ${e.condition ? (isOffLabel(e) ? "off-label (not FDA-approved for this condition)" : e.labelStatus.kind === "no-label" ? "unknown" : "FDA-approved") : "no condition given"}`,
    `Strength of research for this use (GRADE): ${e.grade.label}. ${PATIENT_GRADE[e.grade.level]}`,
    l?.medGuide && `FDA Medication Guide (written for patients): ${truncate(l.medGuide, 9000)}`,
    l && `FDA label, indications: ${truncate(l.indications, 1200)}`,
    l?.mechanism && `FDA label, mechanism: ${truncate(l.mechanism, 800)}`,
    l?.dosage && `FDA label, dosage and administration: ${truncate(l.dosage, 1500)}`,
    l?.boxedWarning && `FDA label, boxed warning: ${truncate(l.boxedWarning, 1000)}`,
    l?.contraindications && `FDA label, contraindications: ${truncate(l.contraindications, 800)}`,
    l?.warnings && `FDA label, warnings: ${truncate(l.warnings, 2000)}`,
    l?.adverseReactions && `FDA label, adverse reactions: ${truncate(l.adverseReactions, 2000)}`,
    l?.interactions && `FDA label, drug interactions: ${truncate(l.interactions, 1500)}`,
    l?.pregnancy && `FDA label, pregnancy: ${truncate(l.pregnancy, 800)}`,
    l?.lactation && `FDA label, lactation: ${truncate(l.lactation, 600)}`,
    l?.patientCounseling && `FDA label, patient counseling: ${truncate(l.patientCounseling, 1500)}`,
    l?.storage && `FDA label, storage: ${truncate(l.storage, 400)}`,
    ...medline.slice(0, 2).map((m) => `MedlinePlus, ${m.title}: ${m.summary}`),
    ...e.studies.slice(0, 3).filter((a) => a.conclusion).map((a) => `Study conclusion (${a.year}): ${a.conclusion}`),
  ];
  return parts.filter(Boolean).join("\n\n");
}

export async function plainLanguage(e: EvidenceBundle, medline: MedlinePlusEntry[]): Promise<PlainLanguage> {
  const basic = basicPlainLanguage(e, medline);
  if (!claudeEnabled() || (!e.label && medline.length === 0)) return basic;
  try {
    const out = await callClaudePlain(e.drug, e.condition, plainSources(e, medline));
    const keep = (s: string) => (s.trim() ? s.trim() : undefined);
    return {
      ...out,
      mode: "ai",
      mostImportant: keep(out.mostImportant),
      missedDose: keep(out.missedDose),
      whatToExpect: keep(out.whatToExpect),
      pregnancy: keep(out.pregnancy),
      // The emergency allergy warning always shows, whatever the summary includes.
      call911: out.call911.some((s) => /allerg|breath/i.test(s)) ? out.call911 : [...out.call911, ALLERGY_911],
    };
  } catch (err) {
    console.error("Patient summary failed", err);
    return basic;
  }
}
