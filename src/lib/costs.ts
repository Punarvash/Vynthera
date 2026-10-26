import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CostMeta, NadacFile, NadacRow, PartDFile, PartDRow } from "./cost-data";
import { attempt } from "./evidence";
import { isDemoMode } from "./http";
import { demoMeta, demoNadac, demoPartD } from "./demo/costs";
import { baseDrugName, drugsByMechanism, getLabel } from "./sources/openfda";
import type { DrugLabel, SourceProblem } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "costs");

let files: Promise<{ nadac: NadacFile; partD: PartDFile; meta: CostMeta }> | null = null;

/** Imported weekly by scripts/costs/import.ts; read once per server instance. */
export function loadCostFiles() {
  if (isDemoMode()) return Promise.resolve({ nadac: demoNadac, partD: demoPartD, meta: demoMeta });
  files ??= (async () => {
    const read = async <T>(name: string) => JSON.parse(await readFile(path.join(DATA_DIR, name), "utf8")) as T;
    const [nadac, partD, meta] = await Promise.all([read<NadacFile>("nadac.json"), read<PartDFile>("partd.json"), read<CostMeta>("meta.json")]);
    return { nadac, partD, meta };
  })();
  return files;
}

export interface NadacPrice {
  description: string;
  perUnit: number;
  unit: string;
  effectiveDate: string;
  brand: boolean;
  otc: boolean;
}

/** NADAC descriptions start with the drug name, e.g. "METFORMIN HCL 500 MG TABLET"; combinations ("SITAGLIPTIN-METFORMIN") are excluded. */
export function nadacForDrug(rows: NadacRow[], names: string[]): NadacPrice[] {
  const prefixes = [...new Set(names.filter(Boolean).map((n) => `${n.toUpperCase()} `))];
  return rows
    .filter(([desc]) => prefixes.some((p) => desc.startsWith(p)))
    .map(([description, perUnit, unit, effectiveDate, cls, otc]) => ({
      description,
      perUnit,
      unit,
      effectiveDate,
      brand: cls === "B",
      otc: otc === "Y",
    }))
    .sort((a, b) => Number(a.brand) - Number(b.brand) || a.perUnit - b.perUnit);
}

export function partDForDrug(rows: PartDRow[], base: string): PartDRow[] {
  return rows.filter((r) => baseDrugName(r.generic) === base).sort((a, b) => b.totalSpending - a.totalSpending);
}

export interface PriceRange {
  min: number;
  max: number;
  unit: string;
}

export function priceRange(prices: NadacPrice[]): PriceRange | null {
  if (prices.length === 0) return null;
  // Compare like with like: use the most common pricing unit.
  const units = prices.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.unit]: (acc[p.unit] ?? 0) + 1 }), {});
  const unit = Object.entries(units).sort((a, b) => b[1] - a[1])[0][0];
  const values = prices.filter((p) => p.unit === unit).map((p) => p.perUnit);
  return { min: Math.min(...values), max: Math.max(...values), unit };
}

const PRODUCT_WORDS: Record<string, string> = {
  hcl: "HCl", mg: "mg", mcg: "mcg", ml: "mL", gm: "g", er: "ER", xr: "XR", sr: "SR", dr: "DR", odt: "ODT", iu: "IU", hbr: "HBr",
};

/** "METFORMIN HCL ER 500 MG TABLET" -> "Metformin HCl ER 500 mg tablet". */
export function formatProduct(description: string): string {
  const words = description.toLowerCase().split(/(\s+|\/|-)/);
  return words
    .map((w, i) => PRODUCT_WORDS[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join("");
}

export function unitLabel(unit: string): string {
  return { EA: "per unit", ML: "per mL", GM: "per gram" }[unit.toUpperCase()] ?? `per ${unit.toLowerCase()}`;
}

export function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)} billion`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} million`;
  return n < 1
    ? `$${n.toFixed(n < 0.1 ? 3 : 2)}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Copays and fixed amounts: "$0", "$47", "$5.10". */
export function dollars(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ClassComparison {
  name: string;
  isThisDrug: boolean;
  genericPerUnit?: number;
  brandPerUnit?: number;
  unit?: string;
  medicarePerClaim?: number;
  medicareClaims?: number;
}

function summarize(name: string, base: string, nadac: NadacRow[], partD: PartDRow[]): ClassComparison {
  const prices = nadacForDrug(nadac, [name]);
  const g = priceRange(prices.filter((p) => !p.brand));
  const b = priceRange(prices.filter((p) => p.brand));
  const rows = partDForDrug(partD, name);
  const spend = rows.reduce((s, r) => s + r.totalSpending, 0);
  const claims = rows.reduce((s, r) => s + r.claims, 0);
  return {
    name,
    isThisDrug: name === base,
    genericPerUnit: g?.min,
    brandPerUnit: b?.min,
    unit: g?.unit ?? b?.unit,
    medicarePerClaim: claims ? spend / claims : undefined,
    medicareClaims: claims || undefined,
  };
}

export interface CostBundle {
  drug: string;
  label: DrugLabel | null;
  meta: CostMeta;
  nadacAsOf: string;
  partDYear: number;
  generic: NadacPrice[];
  brand: NadacPrice[];
  genericRange: PriceRange | null;
  brandRange: PriceRange | null;
  partD: PartDRow[];
  drugClass?: string;
  comparison: ClassComparison[];
  imported: boolean;
  problems: SourceProblem[];
}

export async function getCostBundle(name: string): Promise<CostBundle> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();
  const { nadac, partD, meta } = await loadCostFiles();

  const names = [drug, ...(label?.brandNames ?? [])];
  const prices = nadacForDrug(nadac.rows, names);
  const generic = prices.filter((p) => !p.brand);
  const brand = prices.filter((p) => p.brand);

  const drugClass = label?.pharmClassEpc[0]?.replace(/\s*\[EPC\]$/, "");
  const classmates = drugClass
    ? await attempt("openFDA", problems, [] as { name: string }[], () => drugsByMechanism(drugClass))
    : [];
  const classNames = [...new Set([drug, ...classmates.map((c) => baseDrugName(c.name))])].slice(0, 15);
  const comparison = classNames
    .map((n) => summarize(n, drug, nadac.rows, partD.rows))
    .filter((c) => c.isThisDrug || c.genericPerUnit !== undefined || c.medicarePerClaim !== undefined)
    .sort((a, b) => (a.medicarePerClaim ?? Infinity) - (b.medicarePerClaim ?? Infinity));

  return {
    drug,
    label,
    meta,
    nadacAsOf: nadac.asOf,
    partDYear: partD.year,
    generic,
    brand,
    genericRange: priceRange(generic),
    brandRange: priceRange(brand),
    partD: partDForDrug(partD.rows, drug),
    drugClass,
    comparison: comparison.length > 1 ? comparison : [],
    imported: nadac.rows.length > 0 || partD.rows.length > 0,
    problems,
  };
}
