// Plain-language explanations shown behind the "?" buttons.
export const GLOSSARY = {
  grade:
    "GRADE is the standard system used by the WHO, Cochrane and guideline groups to rate how sure we can be about a treatment's effect: High, Moderate, Low or Very low.",
  medline:
    "MEDLINE is the U.S. National Library of Medicine's index of peer-reviewed biomedical journals. Journals are selected for quality before they are included.",
  metaAnalysis:
    "A meta-analysis combines the results of several studies to get one overall estimate. A systematic review collects every relevant study in a structured way.",
  rct: "A randomized controlled trial assigns patients to treatments by chance, which is the fairest way to compare treatments.",
  observational:
    "An observational study follows patients without assigning treatments. It can show links but not prove that the drug caused the outcome.",
  preprint: "A preprint is a study posted before peer review. Its findings may change.",
  offLabel:
    "Off-label means using an approved drug for a condition not listed on its FDA label. It is legal and common when evidence supports it.",
  mainTopic:
    "A study counts as being about the drug when the drug is in its title or is tagged as a main topic in MEDLINE, not just mentioned in passing.",
  cochrane: "Cochrane reviews are systematic reviews held to strict, published methods and are widely regarded as the most reliable.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
