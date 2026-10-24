// Facts read directly from an abstract's wording. Deterministic, so they work without an AI key.

const PEOPLE =
  "patients|participants|subjects|women|men|adults|children|adolescents|individuals|people|infants|neonates|volunteers|persons|eyes|pregnancies|cases";

function toInt(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/**
 * Largest participant count stated in the abstract ("120 patients were randomized", "n = 480",
 * "14 trials with 2,310 participants"). Returns undefined when nothing plausible is stated.
 */
export function extractSampleSize(text: string): number | undefined {
  const counts: number[] = [];
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,3}(?:,\\d{3})+|\\d+)\\s+(?:[a-z-]+\\s+){0,2}(?:${PEOPLE})\\b`, "gi"))) {
    counts.push(toInt(m[1]));
  }
  for (const m of text.matchAll(/\b[nN]\s*=\s*(\d{1,3}(?:,\d{3})+|\d+)/g)) counts.push(toInt(m[1]));
  const plausible = counts.filter((n) => n >= 2 && n <= 5_000_000);
  return plausible.length ? Math.max(...plausible) : undefined;
}

export function extractBlinding(text: string): "blinded" | "open-label" | undefined {
  if (/\b(double|triple|quadruple)[- ]?(blind|mask)|placebo[- ]controlled|sham[- ]controlled|blinded\b/i.test(text)) return "blinded";
  if (/\bopen[- ]label|\bunblinded|\bnon[- ]blinded|\bsingle[- ]blind/i.test(text)) return "open-label";
  return undefined;
}

export type StatedCertainty = "high" | "moderate" | "low" | "very-low";

const LEVEL = "(very[ -]low|low|moderate|high)";
const STATED = [
  new RegExp(`\\b${LEVEL}[ -](?:quality|certainty|certain)(?:\\s+of)?(?:\\s+the)?\\s+evidence`, "gi"),
  new RegExp(`\\b(?:quality|certainty) of (?:the )?evidence (?:was|is|were|ranged from|as) ${LEVEL}`, "gi"),
  new RegExp(`\\bevidence (?:quality|certainty) (?:was|is|were) ${LEVEL}`, "gi"),
  new RegExp(`\\bevidence (?:was|is|were) (?:of |rated (?:as )?)?${LEVEL}(?: quality| certainty)\\b`, "gi"),
  new RegExp(`\\bGRADE[:)]?\\s*(?:certainty\\s*)?:?\\s*${LEVEL}\\b`, "gi"),
];
/** Wording that talks about evidence that is missing or wanted, not evidence the review graded. */
const NOT_A_RATING = /(lack|absence|paucity|need|needs|needed|more|further|future|no|without|require[sd]?)\W+(?:\w+\W+){0,2}$/i;

/**
 * GRADE certainty ratings a systematic review states in its abstract ("low-certainty evidence",
 * "the quality of evidence was moderate"). Ratings are per outcome, so all distinct levels are returned.
 */
export function extractStatedCertainty(text: string): StatedCertainty[] {
  const found = new Set<StatedCertainty>();
  for (const re of STATED) {
    for (const m of text.matchAll(re)) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index);
      const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 25);
      if (NOT_A_RATING.test(before) || /^\s*(is|are)?\s*(needed|required|warranted|lacking)/i.test(after)) continue;
      found.add(m[1].toLowerCase().replace(/[ -]/, "-") as StatedCertainty);
    }
  }
  return [...found];
}

export function isCochrane(journal: string): boolean {
  return /cochrane database/i.test(journal);
}

/** Lowercase words of a phrase, for "all words present" checks. */
function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length > 1);
}

/** The drug is a main subject: named in the title or tagged as a MeSH major topic. */
export function isAboutDrug(a: { title: string; meshMajor: string[] }, drugTerms: string[]): boolean {
  const title = a.title.toLowerCase();
  return drugTerms.some(
    (t) => title.includes(t.toLowerCase()) || a.meshMajor.some((m) => m === t.toLowerCase() || m.startsWith(`${t.toLowerCase()} `)),
  );
}

/** The condition is a subject: its words appear in the title or in a MeSH heading (or synonym). */
export function isAboutCondition(a: { title: string; mesh: string[] }, phrases: string[]): boolean {
  const title = ` ${words(a.title).join(" ")} `;
  const mesh = a.mesh.map((m) => ` ${words(m).join(" ")} `);
  return phrases.some((p) => {
    const w = words(p);
    if (w.length === 0) return false;
    const all = (hay: string) => w.every((x) => hay.includes(` ${x} `));
    return all(title) || mesh.some(all);
  });
}
