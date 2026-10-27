import { coveringCategory } from "./indication-categories";
import { normalizeForMatch } from "./text";
import { titleCase } from "./text";
import type { DrugLabel, LabelRef, LabelStatus } from "./types";

const STOPWORDS = new Set(["the", "and", "of", "in", "with", "for", "to", "a", "an", "or", "disease", "disorder", "syndrome"]);

/**
 * Decide whether a condition appears in the FDA label's Indications and Usage section.
 * Text matching can miss synonyms (e.g. "T2DM"), so the UI always links to the label to verify.
 */
export function assessLabelStatus(label: DrugLabel | null, condition: string | undefined, synonyms: string[] = []): LabelStatus {
  if (!label) return { kind: "no-label" };
  const cond = condition?.trim();
  if (!cond) return { kind: "no-condition" };

  // Text after "Limitations of Use" lists uses the drug is NOT indicated for.
  const [indicated, ...limits] = label.indications.split(/limitations?\s+of\s+use/i);
  const indicatedText = ` ${normalizeForMatch(indicated)} `;
  const limitText = ` ${normalizeForMatch(limits.join(" "))} `;
  const phrase = normalizeForMatch(cond);
  if (!phrase) return { kind: "no-condition" };

  // The condition as typed, then its MeSH synonyms ("T2DM" -> "type 2 diabetes mellitus").
  const phrases = [phrase, ...synonyms.map(normalizeForMatch).filter((p) => p.length > 2)];
  const exact = phrases.find((p) => indicatedText.includes(` ${p} `));
  if (exact) return { kind: "approved", matched: exact === phrase ? cond : exact };
  if (phrases.some((p) => limitText.includes(` ${p} `))) return { kind: "limitation", matched: cond };

  // Numbers and single letters are kept: "type 1" and "type 2" diabetes must not match each other.
  const tokens = phrase.split(" ").filter((t) => !STOPWORDS.has(t));
  const allTokens = (text: string) => tokens.length > 0 && tokens.every((t) => text.includes(` ${t} `));
  if (allTokens(indicatedText)) return { kind: "likely-approved", matched: tokens.join(", ") };

  // Labels that approve a body site or infection category ("infections of the ear, nose, and throat").
  const covering = coveringCategory(indicated, [cond, ...synonyms]);
  if (covering) return { kind: "likely-approved", matched: covering.wording, covers: covering.category };
  if (allTokens(limitText)) return { kind: "limitation", matched: cond };
  return { kind: "off-label" };
}

const STRENGTH: Record<LabelStatus["kind"], number> = { approved: 0, "likely-approved": 1, limitation: 2, "off-label": 3, "no-condition": 4, "no-label": 5 };

function isBrandApplication(l: DrugLabel): boolean {
  return l.applicationNumbers.some((n) => /^(NDA|BLA)/.test(n));
}

/** Brand (NDA/BLA) labels first: generic labels may leave out uses still under patent or exclusivity ("carved out"). */
export function labelsByAuthority(labels: DrugLabel[]): DrugLabel[] {
  return [...labels].sort((a, b) => Number(isBrandApplication(b)) - Number(isBrandApplication(a)) || b.indications.length - a.indications.length);
}

export function labelRef(l: DrugLabel): LabelRef {
  const name = l.brandNames[0] ?? titleCase(l.genericName);
  return { title: name, manufacturer: l.manufacturer, url: l.dailyMedUrl };
}

/**
 * Approval status across all of a drug's labels (brand, generics, other strengths and forms): the condition is
 * FDA-approved if any label's indications include it. Checking one label misses uses a generic label carves out.
 */
export function assessAcrossLabels(labels: DrugLabel[], condition: string | undefined, synonyms: string[] = []): LabelStatus {
  if (labels.length === 0) return { kind: "no-label" };
  const seen = new Set<string>();
  const distinct = labelsByAuthority(labels).filter((l) => (seen.has(l.indications) ? false : (seen.add(l.indications), true)));
  let best: { status: LabelStatus; label: DrugLabel } | null = null;
  for (const l of distinct) {
    const status = assessLabelStatus(l, condition, synonyms);
    if (!best || STRENGTH[status.kind] < STRENGTH[best.status.kind]) best = { status, label: l };
    if (status.kind === "approved") break;
  }
  if (!best) return { kind: "no-label" };
  const decided = best.status.kind === "approved" || best.status.kind === "likely-approved" || best.status.kind === "limitation";
  return { ...best.status, on: decided ? labelRef(best.label) : undefined, checked: distinct.length };
}

function onLabel(status: LabelStatus, drug: string): string {
  return status.on ? `the ${status.on.title} label (${status.on.manufacturer})` : `the ${drug} label`;
}

export function labelStatusText(status: LabelStatus, drug: string, condition?: string): string {
  switch (status.kind) {
    case "approved":
      return status.matched.toLowerCase() === condition?.toLowerCase()
        ? `FDA-approved: "${condition}" appears in the indications on ${onLabel(status, drug)}.`
        : `FDA-approved: the indications on ${onLabel(status, drug)} include "${status.matched}", another name for ${condition}.`;
    case "likely-approved":
      if (status.covers) {
        return `FDA-approved for ${status.covers}: the indications on ${onLabel(status, drug)} cover "${status.matched}", which includes ${condition}. Check the label for the organisms and patients it covers.`;
      }
      if (status.byAi) {
        return `Probably FDA-approved: the indications on ${onLabel(status, drug)} say "${status.matched}", which appears to cover ${condition}. Confirm on the label.`;
      }
      return `Probably FDA-approved: the indications on ${onLabel(status, drug)} mention ${status.matched}. Confirm the exact wording on the label.`;
    case "limitation":
      return `Not approved: ${onLabel(status, drug)} lists "${condition}" under Limitations of Use.`;
    case "off-label":
      return `Off-label: "${condition}" is not among the FDA-approved uses on ${status.checked && status.checked > 1 ? `any of the ${status.checked} ${drug} labels checked (brand and generic)` : `the ${drug} label`}, including under other names for the condition. Check the label's indications if your patient's diagnosis is worded differently.`;
    case "no-condition":
      return "Add the patient's condition to check off-label status.";
    case "no-label":
      return "No FDA label was found for this drug, so approval status could not be checked.";
  }
}
