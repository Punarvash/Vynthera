import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { claudeEnabled, claudeModel } from "./claude";
import type { EvidenceBundle } from "./evidence";
import { firstSentences, truncate } from "./text";
import type { MedlinePlusEntry } from "./sources/medlineplus";
import type { GradeLevel } from "./types";

/** Plain-language content for the patient view and printable handout. */
export interface PlainLanguage {
  mode: "ai" | "basic";
  whatItIsFor: string;
  howItWorks?: string;
  howToTake?: string;
  benefits: string[];
  commonSideEffects: string[];
  seriousRisks: string[];
  drawbacks: string[];
  whatToExpect?: string;
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isOffLabel(e: EvidenceBundle): boolean {
  return e.labelStatus.kind === "off-label" || e.labelStatus.kind === "limitation";
}

/** Without an AI key: a careful template built from facts already on the page. */
export function basicPlainLanguage(e: EvidenceBundle, medline: MedlinePlusEntry[]): PlainLanguage {
  const drug = capitalize(e.drug);
  let whatItIsFor: string;
  if (e.condition && isOffLabel(e)) {
    whatItIsFor = `Your doctor may prescribe ${drug} for ${e.condition}. This is called "off-label" use: the FDA approved ${drug} for other conditions, and doctors may prescribe it for this one when research and their judgement support it.`;
  } else if (e.condition && (e.labelStatus.kind === "approved" || e.labelStatus.kind === "likely-approved")) {
    whatItIsFor = `${drug} is approved by the FDA to treat ${e.condition}.`;
  } else if (medline[0]?.summary) {
    whatItIsFor = firstSentences(medline[0].summary, 2);
  } else {
    whatItIsFor = e.label ? truncate(firstSentences(e.label.indications, 1), 300) : `${drug} is a prescription medicine.`;
  }

  const seriousRisks: string[] = [];
  if (e.label?.boxedWarning) {
    seriousRisks.push("This medicine has an FDA boxed warning, the strongest warning the FDA gives. Ask your doctor what it means for you.");
  }
  seriousRisks.push("Get medical help right away if you have trouble breathing, swelling of your face or throat, or a severe rash.");

  const drawbacks = ["Cost depends on your insurance. Ask your pharmacist about generic versions and discount programs."];
  if (e.condition && isOffLabel(e)) drawbacks.push("Insurance may not cover off-label use without a letter from your doctor.");

  return {
    mode: "basic",
    whatItIsFor,
    benefits: [PATIENT_GRADE[e.grade.level]],
    commonSideEffects: [],
    seriousRisks,
    drawbacks,
    questions: e.condition && isOffLabel(e) ? [...STANDARD_QUESTIONS, "Will my insurance cover this off-label use?"] : STANDARD_QUESTIONS,
  };
}

const PlainSchema = z.object({
  whatItIsFor: z.string().describe("Two sentences: what the medicine is and why this patient may take it."),
  howItWorks: z.string().describe("One or two sentences, no jargon."),
  howToTake: z.string().describe("General guidance from the label (with food, time of day). Say to follow the doctor's dose."),
  benefits: z.array(z.string()).describe("Two to four benefits, honest about how strong the research is."),
  commonSideEffects: z.array(z.string()).describe("The most common side effects, with how often they happen if the label says."),
  seriousRisks: z.array(z.string()).describe("Serious risks and when to call the doctor or get emergency help."),
  drawbacks: z.array(z.string()).describe("Practical drawbacks: monitoring, cost, interactions, time to work."),
  whatToExpect: z.string().describe("What recovery or improvement typically looks like and how long it takes, if the sources say."),
  questions: z.array(z.string()).describe("Four or five questions the patient could ask their doctor."),
});

const PLAIN_SYSTEM = `You write patient handouts about prescription medicines in plain language at a 6th to 8th grade reading level.
Use only the facts in the sources provided. Do not invent statistics, doses or outcomes. If a source does not say something, leave it out or say the doctor will explain.
Never tell the patient to change their dose. Use short sentences and everyday words, and explain any medical word you must use.
If the use is off-label, explain kindly what that means. Be honest about uncertainty in the research.`;

async function callClaudePlain(drug: string, condition: string | undefined, sources: string) {
  "use cache";
  cacheLife("days");
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: claudeModel(),
    max_tokens: 4000,
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
    l && `FDA label, indications: ${truncate(l.indications, 1200)}`,
    l?.mechanism && `FDA label, mechanism: ${truncate(l.mechanism, 800)}`,
    l?.dosage && `FDA label, dosage and administration: ${truncate(l.dosage, 1500)}`,
    l?.boxedWarning && `FDA label, boxed warning: ${truncate(l.boxedWarning, 1000)}`,
    l?.contraindications && `FDA label, contraindications: ${truncate(l.contraindications, 800)}`,
    l?.warnings && `FDA label, warnings: ${truncate(l.warnings, 2000)}`,
    l?.adverseReactions && `FDA label, adverse reactions: ${truncate(l.adverseReactions, 2500)}`,
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
    return { mode: "ai", ...out };
  } catch (err) {
    console.error("Patient summary failed", err);
    return basic;
  }
}
