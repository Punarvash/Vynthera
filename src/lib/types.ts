// Shared domain types. Every claim shown in the UI carries a `url` back to its source.

export type StudyDesign =
  | "meta-analysis"
  | "systematic-review"
  | "rct"
  | "clinical-trial"
  | "observational"
  | "case-series"
  | "case-report"
  | "review"
  | "other";

export type FundingKind = "industry" | "independent" | "unreported";

export interface Funding {
  kind: FundingKind;
  /** Human-readable reason, shown next to the badge. */
  reason: string;
}

export interface Article {
  id: string;
  source: "pubmed" | "preprint";
  peerReviewed: boolean;
  title: string;
  journal: string;
  year: string;
  authors: string;
  abstract: string;
  /** Conclusion section of a structured abstract, when present. */
  conclusion?: string;
  design: StudyDesign;
  /** True when the design was guessed from title/abstract text (preprints). */
  designInferred: boolean;
  url: string;
  pmid?: string;
  doi?: string;
  nctIds: string[];
  grantAgencies: string[];
  funding: Funding;
}

export type SponsorClass =
  | "INDUSTRY"
  | "NIH"
  | "FED"
  | "OTHER_GOV"
  | "INDIV"
  | "NETWORK"
  | "AMBIG"
  | "OTHER"
  | "UNKNOWN";

export interface Trial {
  nctId: string;
  title: string;
  sponsor: string;
  sponsorClass: SponsorClass;
  status: string;
  phases: string[];
  studyType: string;
  enrollment?: number;
  hasResults: boolean;
  startDate?: string;
  conditions: string[];
  url: string;
}

export interface DrugLabel {
  genericName: string;
  brandNames: string[];
  manufacturer: string;
  indications: string;
  mechanism?: string;
  pharmClassMoa: string[];
  pharmClassEpc: string[];
  toxicology?: string;
  routes: string[];
  setId: string;
  /** ISO date (YYYY-MM-DD) of the label version. */
  effectiveDate?: string;
  dailyMedUrl: string;
}

export interface TargetMechanism {
  mechanismOfAction: string;
  actionType?: string;
  targets: string[];
}

export type LabelStatus =
  | { kind: "approved"; matched: string }
  | { kind: "likely-approved"; matched: string }
  | { kind: "limitation"; matched: string }
  | { kind: "off-label" }
  | { kind: "no-condition" }
  | { kind: "no-label" };

export type GradeLevel = "high" | "moderate" | "low" | "very-low" | "insufficient";

export interface GradeAssessment {
  level: GradeLevel;
  label: string;
  /** The established GRADE definition for this level. */
  definition: string;
  rationale: string[];
  notAssessed: string[];
}

/** A source that failed to respond; shown to the user instead of silently dropping data. */
export interface SourceProblem {
  source: string;
  message: string;
}
