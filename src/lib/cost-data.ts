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

export interface CostMeta {
  importedAt: string;
  nadac?: { title: string; url: string; asOf: string; rows: number };
  partD?: { title: string; url: string; year: number; rows: number };
  /** data.cms.gov API for "Medicare Part D Prescribers - by Provider and Drug", used by the Specialists tab. */
  prescribers?: { title: string; apiUrl: string; year?: number };
}
