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
  /** MeSH descriptors marked as a major topic of the article (lowercase). */
  meshMajor: string[];
  /** All MeSH descriptors (lowercase). */
  mesh: string[];
  pmcid?: string;
  /** A Cochrane systematic review. */
  cochrane: boolean;
  /** Participants, read from the abstract when stated. */
  sampleSize?: number;
  /** Trial masking, read from the abstract when stated. */
  blinding?: "blinded" | "open-label";
  /** Times cited, from Europe PMC. */
  citations?: number;
  /** Whether the drug is a main subject of the study (title or MeSH major topic), not just mentioned. */
  aboutDrug: boolean;
  /** Direction of the main result for the drug, judged by AI from the abstract. */
  direction?: "favors" | "neutral" | "against" | "unclear";
  /** GRADE certainty the review's authors state in the abstract, one per distinct level (reviews only). */
  statedCertainty?: ("high" | "moderate" | "low" | "very-low")[];
  /** Funding and conflict-of-interest statements from the open-access full text. */
  fundingStatement?: string;
  coiStatement?: string;
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
  /** First primary outcome with posted results, when available. */
  result?: TrialOutcome;
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
  /** RxNorm concept IDs, used for MedlinePlus lookups. */
  rxcuis: string[];
  /** FDA application numbers: NDA/BLA (original brand) or ANDA (generic). */
  applicationNumbers: string[];
  dosage?: string;
  adverseReactions?: string;
  adverseTable?: LabelTable;
  boxedWarning?: string;
  warnings?: string;
  contraindications?: string;
  pregnancy?: string;
  lactation?: string;
  pediatricUse?: string;
  geriatricUse?: string;
  /** Use in specific populations (renal and hepatic impairment and others). */
  specificPopulations?: string;
  interactions?: string;
  overdosage?: string;
  pharmacokinetics?: string;
  storage?: string;
  howSupplied?: string;
  /** Patient counseling information (section 17). */
  patientCounseling?: string;
  /** FDA-approved patient Medication Guide or patient package insert, written for patients. */
  medGuide?: string;
  /** Over-the-counter Drug Facts sections. */
  otc?: { purpose?: string; whenUsing?: string; doNotUse?: string; askDoctor?: string; stopUse?: string; directions?: string };
  /** DEA schedule, e.g. "CII", for controlled substances. */
  controlledSubstance?: string;
  setId: string;
  /** ISO date (YYYY-MM-DD) of the label version. */
  effectiveDate?: string;
  dailyMedUrl: string;
}

export interface LabelTable {
  caption?: string;
  rows: string[][];
}

export interface TargetMechanism {
  mechanismOfAction: string;
  actionType?: string;
  targets: string[];
}

export type LabelStatus =
  | { kind: "approved"; matched: string }
  /** covers: the label approves a category that includes the condition (e.g. ear, nose and throat infections). */
  | { kind: "likely-approved"; matched: string; covers?: string; byAi?: boolean }
  | { kind: "limitation"; matched: string }
  | { kind: "off-label" }
  | { kind: "no-condition" }
  | { kind: "no-label" };

export type GradeLevel = "high" | "moderate" | "low" | "very-low" | "insufficient" | "needs-condition";

export type GradeDomainName = "Risk of bias" | "Inconsistency" | "Indirectness" | "Imprecision" | "Publication bias";

export interface GradeDomain {
  name: GradeDomainName;
  status: "no-concern" | "downgraded" | "not-assessed";
  reason: string;
}

export interface GradeAssessment {
  level: GradeLevel;
  label: string;
  /** The established GRADE definition for this level. */
  definition: string;
  /** Certainty before downgrades, set by the best study design. */
  startLevel?: GradeLevel;
  rationale: string[];
  domains: GradeDomain[];
  /** Systematic reviews that state their own GRADE ratings for this drug and condition. */
  published?: PublishedRating[];
}

export interface PublishedRating {
  id: string;
  label: string;
  url: string;
  cochrane: boolean;
  levels: ("high" | "moderate" | "low" | "very-low")[];
}

/** Full PubMed counts of studies where the drug is a main topic, by design. */
export interface DesignCounts {
  metaAnalyses: number;
  rcts: number;
  nonRandomized: number;
  observational: number;
  caseReports: number;
}

export interface TrialOutcome {
  title: string;
  timeFrame?: string;
  unit?: string;
  groups: { title: string; participants?: string; value: string }[];
  pValue?: string;
}

/** A source that failed to respond; shown to the user instead of silently dropping data. */
export interface SourceProblem {
  source: string;
  message: string;
}
