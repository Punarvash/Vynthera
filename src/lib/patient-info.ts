import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { claudeEnabled, claudeModel } from "./claude";
import type { EvidenceBundle } from "./evidence";
import { items, parseMedGuide, sentencesMatching, splitSideEffects } from "./medguide";
import { firstSentences, truncate } from "./text";
import type { MedlinePlusEntry } from "./sources/medlineplus";
import type { GradeLevel, LabelTable } from "./types";

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
  /** The handful of things the patient must remember, shown first. */
  topFive: string[];
  /** Side effects from the label's clinical trial table, with how often they happened. */
  sideEffectRates: SideEffectRate[];
  /** Blood tests, check-ups or monitoring the patient may need. */
  monitoring: string[];
  /** The usual dose, from the label, with the reminder that the doctor sets the dose. */
  usualDose?: string;
  overdose: string;
}

export interface SideEffectRate {
  effect: string;
  /** Percent of people taking the drug in the trials. */
  percent: number;
  /** Percent taking placebo (dummy pill), when the table shows it. */
  placebo?: number;
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

function percentIn(cell: string | undefined): number | undefined {
  if (!cell) return undefined;
  // "53 (9.2)" is a count with its percent; "9.2" or "9.2%" is a percent.
  const paren = cell.match(/\(\s*(\d+(?:\.\d+)?)\s*%?\s*\)/);
  const plain = cell.match(/^\s*<?\s*(\d+(?:\.\d+)?)\s*%?\s*$/);
  const v = Number(paren?.[1] ?? plain?.[1]);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : undefined;
}

/**
 * The label's adverse reaction table as "how often" facts: the drug's column and the placebo column, most common first.
 * Rows that are headings (body systems) or have no percentage are skipped.
 */
export function sideEffectRates(table: LabelTable | undefined, max = 8): SideEffectRate[] {
  if (!table) return [];
  const headerIdx = table.rows.findIndex((r) => r.length >= 2 && r.slice(1).some((c) => /placebo|%|\(n\s*=|n\s*=/i.test(c)));
  if (headerIdx < 0) return [];
  const header = table.rows[headerIdx];
  const placeboCol = header.findIndex((c, i) => i > 0 && /placebo|vehicle/i.test(c));
  const drugCol = header.findIndex((c, i) => i > 0 && !/placebo|vehicle|comparator|total/i.test(c));
  if (drugCol < 0) return [];
  const out: SideEffectRate[] = [];
  for (const r of table.rows.slice(headerIdx + 1)) {
    const effect = (r[0] ?? "").replace(/[*†‡§¶#]+|\s*\([a-z]\)\s*$/g, "").trim();
    const percent = percentIn(r[drugCol]);
    if (!effect || effect.length > 60 || /system organ|^body as a whole|disorders$|^total|^any adverse/i.test(effect) || percent === undefined || percent < 1) continue;
    out.push({ effect: capitalize(effect.toLowerCase()), percent, placebo: placeboCol > 0 ? percentIn(r[placeboCol]) : undefined });
  }
  return out.sort((a, b) => b.percent - a.percent).slice(0, max);
}

/** Drop label cross-references ("(5.1)", "[see Warnings (5.2)]") from a sentence meant for patients. */
function forPatients(s: string): string {
  return s.replace(/\[\s*see[^\]]*\]/gi, "").replace(/\(\s*\d+(\.\d+)*\s*\)/g, "").replace(/\s+([.,;])/g, "$1").replace(/\s+/g, " ").trim();
}

const POISON_HELP = "If you take too much, call Poison Help at 1-800-222-1222 (free, open 24 hours) or go to the nearest emergency room. If someone collapses, has a seizure or cannot breathe, call 911.";

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

  // Alcohol is a common question; say so when the label raises it.
  const allText = `${l?.medGuide ?? ""} ${l?.warnings ?? ""} ${l?.interactions ?? ""} ${counseling ?? ""}`;
  if (/alcohol/i.test(allText) && !avoid.some((a) => /alcohol/i.test(a))) {
    const said = sentencesMatching(l?.medGuide ?? counseling, /alcohol/i, 1)[0];
    avoid.unshift(said ? forPatients(said) : "The label warns about alcohol with this medicine. Ask your doctor whether, and how much, you can drink.");
  }

  const monitoring = [
    ...sentencesMatching(`${l?.medGuide ?? ""} ${counseling ?? ""}`, /\b(blood tests?|lab(oratory)? tests?|check your|monitor|eye exam|kidney function|liver (function|tests?)|regular (visits|check))/i, 4),
  ].map(forPatients).filter((x, i, a) => x.length < 300 && a.indexOf(x) === i);

  const doseSentence = (l?.dosage?.match(/[^.]*\b(recommended|usual|starting|initial)\s+(starting\s+|adult\s+)?dos(e|age)[^.]*\./i) ?? [])[0];
  const usualDose = doseSentence ? `${truncate(forPatients(doseSentence), 260)} Your doctor may choose a different dose for you.` : undefined;

  const overdoseSaid = sentencesMatching(guide.howToTake, /too much|overdose/i, 1)[0];
  const overdose = overdoseSaid ? `${forPatients(overdoseSaid)} ${POISON_HELP}` : POISON_HELP;

  const rates = sideEffectRates(l?.adverseTable);

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
    topFive: topFiveFrom({ mostImportant, howToTake, commonSideEffects: common, call911, avoid, missedDose: missed || undefined }),
    sideEffectRates: rates,
    monitoring,
    usualDose,
    overdose,
  };
}

/** The handful of points a patient must remember: safety first, then how to take it, then what to watch for. */
export function topFiveFrom(p: { mostImportant?: string; howToTake: string[]; commonSideEffects: string[]; call911: string[]; avoid: string[]; missedDose?: string }): string[] {
  const out: string[] = [];
  if (p.mostImportant) out.push(truncate(firstSentences(p.mostImportant, 1), 220));
  if (p.howToTake[0]) out.push(truncate(p.howToTake[0], 200));
  if (p.commonSideEffects.length) out.push(`Common side effects: ${p.commonSideEffects.slice(0, 4).join(", ").toLowerCase()}. Tell your doctor if they bother you.`);
  const emergency = p.call911.find((c) => !/allerg/i.test(c)) ?? p.call911[0];
  if (emergency) out.push(`Get emergency help for: ${truncate(emergency.replace(/\.$/, ""), 180).toLowerCase()}.`);
  const avoid = p.avoid.find((a) => !/^Tell your doctor and pharmacist about every medicine/.test(a));
  out.push(avoid ? truncate(avoid, 200) : "Tell your doctor and pharmacist about every medicine, vitamin and supplement you take.");
  return out.slice(0, 5);
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
  topFive: z.array(z.string()).describe("The five most important things to remember, one short sentence each, safety first."),
  monitoring: z.array(z.string()).describe("Blood tests, check-ups or monitoring the sources say are needed, in everyday words. Empty if none."),
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
      topFive: out.topFive.length ? out.topFive.slice(0, 5) : basic.topFive,
      sideEffectRates: basic.sideEffectRates,
      monitoring: out.monitoring.length ? out.monitoring : basic.monitoring,
      usualDose: basic.usualDose,
      overdose: basic.overdose,
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
