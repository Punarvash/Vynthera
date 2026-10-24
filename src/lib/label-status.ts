import { normalizeForMatch } from "./text";
import type { DrugLabel, LabelStatus } from "./types";

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
  if (allTokens(limitText)) return { kind: "limitation", matched: cond };
  return { kind: "off-label" };
}

export function labelStatusText(status: LabelStatus, drug: string, condition?: string): string {
  switch (status.kind) {
    case "approved":
      return status.matched.toLowerCase() === condition?.toLowerCase()
        ? `FDA-approved: "${condition}" appears in the indications on the ${drug} label.`
        : `FDA-approved: the ${drug} label indications include "${status.matched}", a synonym of ${condition}.`;
    case "likely-approved":
      return `Probably FDA-approved: the label indications mention ${status.matched}. Confirm the exact wording on the label.`;
    case "limitation":
      return `Not approved: the label lists "${condition}" under Limitations of Use.`;
    case "off-label":
      return `Off-label: "${condition}" was not found in the FDA label indications for ${drug}. Synonyms can be missed, so confirm on the label.`;
    case "no-condition":
      return "Add the patient's condition to check off-label status.";
    case "no-label":
      return "No FDA label was found for this drug, so approval status could not be checked.";
  }
}
