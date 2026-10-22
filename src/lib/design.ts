import type { StudyDesign } from "./types";

/** Strongest design first; used to order studies and to start a GRADE rating. */
export const DESIGN_RANK: StudyDesign[] = [
  "meta-analysis",
  "systematic-review",
  "rct",
  "clinical-trial",
  "observational",
  "case-series",
  "case-report",
  "review",
  "other",
];

export const DESIGN_LABEL: Record<StudyDesign, string> = {
  "meta-analysis": "Meta-analysis",
  "systematic-review": "Systematic review",
  rct: "Randomized controlled trial",
  "clinical-trial": "Non-randomized clinical trial",
  observational: "Observational study",
  "case-series": "Case series",
  "case-report": "Case report",
  review: "Narrative review",
  other: "Other",
};

const PUB_TYPE_MAP: [RegExp, StudyDesign][] = [
  [/^meta-analysis$/i, "meta-analysis"],
  [/^systematic review$/i, "systematic-review"],
  [/^randomized controlled trial$/i, "rct"],
  [/^(controlled )?clinical trial(, phase [iv]+)?$/i, "clinical-trial"],
  [/^(observational study|cohort studies|case-control studies)$/i, "observational"],
  [/^case reports$/i, "case-report"],
  [/^review$/i, "review"],
];

/** Map PubMed publication types to the strongest matching design. */
export function pickDesign(pubTypes: string[]): StudyDesign {
  const designs = pubTypes.flatMap((t) => PUB_TYPE_MAP.filter(([re]) => re.test(t.trim())).map(([, d]) => d));
  return DESIGN_RANK.find((d) => designs.includes(d)) ?? "other";
}

/** Preprints have no publication types; infer a design from wording, and say so in the UI. */
export function inferDesignFromText(text: string): StudyDesign {
  const t = text.toLowerCase();
  if (/meta-analys/.test(t)) return "meta-analysis";
  if (/systematic review/.test(t)) return "systematic-review";
  if (/randomi[sz]ed/.test(t) && /(trial|controlled)/.test(t)) return "rct";
  if (/case series/.test(t)) return "case-series";
  if (/case report|a case of|we (report|present|describe) (a|an|two|three)/.test(t)) return "case-report";
  if (/cohort|case-control|retrospective|observational|registry/.test(t)) return "observational";
  if (/trial/.test(t)) return "clinical-trial";
  return "other";
}

export function compareDesign(a: StudyDesign, b: StudyDesign): number {
  return DESIGN_RANK.indexOf(a) - DESIGN_RANK.indexOf(b);
}
