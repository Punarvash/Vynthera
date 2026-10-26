// Shapes of the files written weekly by scripts/costs/import.ts into data/costs/.
// Kept free of runtime imports so the import script can share them.

/** One NADAC price per NDC description: [description, $ per unit, unit, effective date, "B" brand | "G" generic, OTC "Y" | "N"]. */
export type NadacRow = [string, number, string, string, string, string];

export interface NadacFile {
  datasetTitle: string;
  sourceUrl: string;
  /** Latest "as of" date in the dataset (ISO). */
  asOf: string;
  rows: NadacRow[];
}

export interface PartDRow {
  brand: string;
  generic: string;
  manufacturers: number;
  totalSpending: number;
  claims: number;
  beneficiaries: number;
  dosageUnits: number;
  avgPerUnit: number;
  avgPerClaim: number;
  avgPerBeneficiary: number;
  /** Change in average spending per unit vs. the previous year, as a fraction (0.05 = +5%). */
  changePerUnit?: number;
}

export interface PartDFile {
  datasetTitle: string;
  sourceUrl: string;
  year: number;
  rows: PartDRow[];
}

/**
 * Coverage of one RxCUI across a group of Part D plans:
 * [plans covering, most common tier, with prior authorization, with step therapy, with quantity limit,
 *  median copay ($, -1 if none), median coinsurance (fraction, -1 if none), plans where the deductible applies,
 *  plans charging a copay, plans charging coinsurance].
 */
export type PlanCoverage = [number, number, number, number, number, number, number, number, number, number];

export interface PlanCoverageFile {
  year: number;
  /** Date of the CMS monthly file. */
  asOf: string;
  sourceUrl: string;
  totalPlans: number;
  insurers: { name: string; plans: number }[];
  states: { code: string; plans: number }[];
  drugs: Record<
    string,
    {
      all: PlanCoverage;
      /** [insurer index, ...PlanCoverage] for insurers with at least one covering plan. */
      insurers: [number, ...PlanCoverage][];
      /** [state index, plans covering]. */
      states: [number, number][];
    }
  >;
}

/** Medicare Part B payment limit for one billing (HCPCS) code: ASP + 6%. */
export interface PartBLimit {
  hcpcs: string;
  description: string;
  /** Billing unit, e.g. "10 MG". */
  dosage: string;
  limit: number;
  coinsurance: number;
  /** Product names billed under the code (from the NDC crosswalk). */
  drugNames: string[];
}

export interface PartBFile {
  quarter: string;
  sourceUrl: string;
  rows: PartBLimit[];
}

export interface PartBSpendingRow {
  hcpcs: string;
  description: string;
  brand: string;
  generic: string;
  totalSpending: number;
  claims: number;
  beneficiaries: number;
  avgPerUnit: number;
  avgPerClaim: number;
  avgPerBeneficiary: number;
}

export interface PartBSpendingFile {
  datasetTitle: string;
  sourceUrl: string;
  year: number;
  rows: PartBSpendingRow[];
}

/** One negotiated Medicare price ("maximum fair price") per selected drug and effective period. */
export interface NegotiatedRow {
  /** Initial price applicability year: the first year a negotiated price applies. */
  ipay: number;
  drug: string;
  ingredient: string;
  effective: string;
  end: string;
  price30Day: number;
}

export interface NegotiatedFile {
  sourceUrl: string;
  asOf: string;
  rows: NegotiatedRow[];
}

/** Lowest current VA Federal Supply Schedule price per product: [description, $ per unit, unit count basis, price type, trade name]. */
export type VaRow = [string, number, string, string, string];

export interface VaFile {
  sourceUrl: string;
  asOf: string;
  rows: VaRow[];
}

/** NADAC per unit by month: months are "YYYY-MM"; null where the product had no price that month. */
export interface NadacHistoryFile {
  months: string[];
  rows: Record<string, (number | null)[]>;
}

export interface CostMeta {
  importedAt: string;
  nadac?: { title: string; url: string; asOf: string; rows: number };
  partD?: { title: string; url: string; year: number; rows: number };
  planCoverage?: { url: string; asOf: string; plans: number; version?: number };
  partB?: { url: string; quarter: string; rows: number };
  partBSpending?: { url: string; year: number; rows: number };
  negotiated?: { url: string; asOf: string; rows: number };
  va?: { url: string; asOf: string; rows: number };
  nadacHistory?: { years: number[]; months: number };
  /** data.cms.gov API for "Medicare Part D Prescribers - by Provider and Drug", used by the Specialists tab. */
  prescribers?: { title: string; apiUrl: string; year?: number };
  /** data.cms.gov API for "Medicare Physician & Other Practitioners - by Provider and Service" (clinic-given drugs). */
  partBProviders?: { title: string; apiUrl: string; year?: number };
}
