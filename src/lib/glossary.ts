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
  nadac:
    "NADAC is a weekly government survey of what US retail pharmacies pay wholesalers for a drug. It is run for Medicaid but covers all pharmacies. Counter prices add a dispensing fee and markup.",
  partD:
    "Medicare Part D is drug coverage for people on Medicare, sold by private insurers. The cost shown is the total paid for a fill: the plan's share plus the patient's.",
  partB:
    "Medicare Part B pays for drugs given in a clinic or hospital outpatient department, such as infusions. The payment limit is the drug's average sales price plus 6%.",
  asp: "Average sales price (ASP) is what manufacturers report they actually sell the drug for, after most discounts. Medicare pays clinics ASP + 6% for Part B drugs.",
  negotiated:
    "Under the Inflation Reduction Act, Medicare negotiates prices for some high-cost drugs. The negotiated price applies to Medicare Part D claims from the year shown.",
  tier: "Plans sort covered drugs into tiers. Lower tiers (usually generics) have lower copays; higher tiers (brand and specialty drugs) cost the patient more.",
  priorAuth:
    "Prior authorization means the plan must approve the drug before it pays, usually after the doctor explains why it is needed.",
  stepTherapy: "Step therapy means the plan wants the patient to try a cheaper drug first before it covers this one.",
  extraHelp:
    "Extra Help is a Medicare program that lowers drug costs for people with limited income and savings. Enrollees pay small fixed copays.",
  biosimilar:
    "A biosimilar is a near-copy of a biologic drug with no meaningful differences in safety or effect. An interchangeable biosimilar can be swapped in at the pharmacy, like a generic.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
