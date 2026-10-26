import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  NadacHistoryFile,
  NegotiatedFile,
  NegotiatedRow,
  PartBFile,
  PartBLimit,
  PartBSpendingFile,
  PartBSpendingRow,
  PlanCoverage,
  PlanCoverageFile,
  TopPrescribersFile,
  VaFile,
} from "./cost-data";
import type { CostBundle } from "./costs";
import { attempt } from "./evidence";
import { isDemoMode } from "./http";
import { demoNegotiated, demoPartB, demoPlanCoverage, demoVa } from "./demo/costs";
import { applicationsForDrug } from "./sources/drugsfda";
import { getLabels } from "./sources/openfda";
import { marketplaceEnabled } from "./sources/marketplace";
import { productRxcuis } from "./sources/rxnav";

const DATA_DIR = path.join(process.cwd(), "data", "costs");

interface ExtraFiles {
  coverage: PlanCoverageFile | null;
  partB: PartBFile | null;
  partBSpending: PartBSpendingFile | null;
  negotiated: NegotiatedFile | null;
  va: VaFile | null;
  history: NadacHistoryFile | null;
  topPrescribers: TopPrescribersFile | null;
}

let extra: Promise<ExtraFiles> | null = null;

/** Larger weekly imports, read once per server instance; a missing file just hides its section. */
function loadExtraFiles(): Promise<ExtraFiles> {
  if (isDemoMode()) {
    return Promise.resolve({ coverage: demoPlanCoverage, partB: demoPartB, partBSpending: null, negotiated: demoNegotiated, va: demoVa, history: null, topPrescribers: null });
  }
  extra ??= (async () => {
    const read = async <T>(name: string): Promise<T | null> => {
      try {
        return JSON.parse(await readFile(path.join(DATA_DIR, name), "utf8")) as T;
      } catch {
        return null;
      }
    };
    const [coverage, partB, partBSpending, negotiated, va, history, topPrescribers] = await Promise.all([
      read<PlanCoverageFile>("plan-coverage.json"),
      read<PartBFile>("partb.json"),
      read<PartBSpendingFile>("partb-spending.json"),
      read<NegotiatedFile>("negotiated.json"),
      read<VaFile>("va.json"),
      read<NadacHistoryFile>("nadac-history.json"),
      read<TopPrescribersFile>("prescribers-top.json"),
    ]);
    return { coverage, partB, partBSpending, negotiated, va, history, topPrescribers };
  })();
  return extra;
}

/** Part B payment limits (billing codes per drug), shared with the Specialists tab. */
export async function loadPartBLimits(): Promise<PartBFile | null> {
  return (await loadExtraFiles()).partB;
}

/** The weekly nationwide top-prescriber index, shared with the Specialists tab. */
export async function loadTopPrescribers(): Promise<TopPrescribersFile | null> {
  return (await loadExtraFiles()).topPrescribers;
}

export interface CoverageStats {
  plans: number;
  covered: number;
  tier: number;
  priorAuth: number;
  stepTherapy: number;
  quantityLimit: number;
  medianCopay?: number;
  medianCoinsurance?: number;
  deductibleApplies: number;
  copayPlans: number;
  coinsurancePlans: number;
}

function stats(c: PlanCoverage, plans: number): CoverageStats {
  const [covered, tier, pa, st, ql, copay, coins, ded, nCopay, nCoins] = c;
  return {
    plans,
    covered,
    tier,
    priorAuth: pa,
    stepTherapy: st,
    quantityLimit: ql,
    medianCopay: copay >= 0 ? copay : undefined,
    medianCoinsurance: coins >= 0 ? coins : undefined,
    deductibleApplies: ded,
    copayPlans: nCopay,
    coinsurancePlans: nCoins,
  };
}

export interface PlanCoverageSummary {
  year: number;
  asOf: string;
  sourceUrl: string;
  /** Across all Medicare drug plans, for the drug's most widely covered form. */
  overall: CoverageStats;
  insurers: (CoverageStats & { name: string })[];
  states: { code: string; plans: number; covered: number }[];
}

/**
 * Coverage of a drug across Medicare Part D plans. A drug has one RxCUI per strength and form;
 * each insurer row uses that insurer's most widely covered RxCUI, so it answers "does this insurer cover the drug at all".
 */
export function summarizePlanCoverage(file: PlanCoverageFile, rxcuis: string[]): PlanCoverageSummary | null {
  const entries = rxcuis.map((r) => file.drugs[r]).filter((d): d is PlanCoverageFile["drugs"][string] => Boolean(d));
  if (entries.length === 0) return null;
  const best = entries.reduce((a, b) => (b.all[0] > a.all[0] ? b : a));
  const insurers = file.insurers.map((ins, i) => {
    const rows = entries.map((e) => e.insurers.find((r) => r[0] === i)).filter((r): r is [number, ...PlanCoverage] => Boolean(r));
    const top = rows.reduce<[number, ...PlanCoverage] | undefined>((a, b) => (!a || b[1] > a[1] ? b : a), undefined);
    const empty: PlanCoverage = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0];
    return { name: ins.name, ...stats(top ? (top.slice(1) as PlanCoverage) : empty, ins.plans) };
  });
  // A plan covers the drug if it covers any strength: when insurers' best forms differ, add them up
  // (counts and restrictions); the typical costs and tier stay those of the most widely covered form.
  const base = stats(best.all, file.totalPlans);
  const sum = (k: "covered" | "priorAuth" | "stepTherapy" | "quantityLimit" | "deductibleApplies") => insurers.reduce((n, i) => n + i[k], 0);
  const overall =
    sum("covered") > base.covered
      ? { ...base, covered: Math.min(file.totalPlans, sum("covered")), priorAuth: sum("priorAuth"), stepTherapy: sum("stepTherapy"), quantityLimit: sum("quantityLimit"), deductibleApplies: sum("deductibleApplies") }
      : base;
  return {
    year: file.year,
    asOf: file.asOf,
    sourceUrl: file.sourceUrl,
    overall,
    insurers: insurers.filter((i) => i.plans > 0).sort((a, b) => b.plans - a.plans),
    states: file.states.map((s, i) => ({
      code: s.code,
      plans: s.plans,
      covered: Math.max(0, ...entries.map((e) => e.states.find((x) => x[0] === i)?.[1] ?? 0)),
    })),
  };
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Part B codes billed for this drug: the crosswalk names a product, or the code's description names the drug. */
export function partBForDrug(rows: PartBLimit[], names: string[]): PartBLimit[] {
  const wanted = names.map((n) => n.toLowerCase());
  return rows.filter((r) => {
    // Biosimilar codes read "Inj infliximab-dyyb 10 mg", so every word of the name anywhere in the description counts.
    const desc = new Set(words(r.description));
    const inDescription = (n: string) => words(n).every((w) => desc.has(w));
    return wanted.some((n) => r.drugNames.some((d) => d === n || d.startsWith(`${n} `) || d.startsWith(`${n}-`)) || inDescription(n));
  });
}

export function partBSpendingForDrug(rows: PartBSpendingRow[], names: string[]): PartBSpendingRow[] {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  return rows
    .filter((r) => wanted.has(r.generic.toLowerCase()) || wanted.has(r.brand.toLowerCase()) || wanted.has(words(r.generic)[0] ?? ""))
    .sort((a, b) => b.totalSpending - a.totalSpending);
}

/** Ingredients of a negotiated drug ("valsartan / sacubitrilat", "metformin; sitagliptin") as lowercase words. */
function ingredientParts(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/,\s*human\b/g, "")
    .split(/\s*(?:;|\/|,|\band\b)\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .sort();
}

/** Same ingredients, allowing salt or moiety endings ("sacubitril" ~ "sacubitrilat"). */
function sameIngredients(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i] || x.startsWith(b[i]) || b[i].startsWith(x));
}

/**
 * Negotiated prices for the drug: the one in effect on `today`, and the next one if announced.
 * Combination products only match the same combination, so metformin does not pick up Janumet.
 */
export function negotiatedForDrug(rows: NegotiatedRow[], ingredient: string, brands: string[], today: string): { current?: NegotiatedRow; next?: NegotiatedRow; all: NegotiatedRow[] } {
  const want = ingredientParts(ingredient);
  const brandSet = new Set(brands.map((b) => b.toLowerCase()));
  const all = rows
    // Some rows in the CMS file end before they start; treat those as open-ended.
    .map((r) => ({ ...r, end: r.end && r.end >= r.effective ? r.end : "" }))
    .filter((r) => sameIngredients(ingredientParts(r.ingredient), want) || r.drug.toLowerCase().split(/;\s*/).some((d) => brandSet.has(d)));
  const current = all.filter((r) => r.effective <= today && (!r.end || r.end >= today)).sort((a, b) => b.effective.localeCompare(a.effective))[0];
  const next = all.filter((r) => r.effective > today).sort((a, b) => a.effective.localeCompare(b.effective))[0];
  return { current, next, all };
}

export interface VaPrice {
  description: string;
  perUnit: number;
  unit: string;
  priceType: string;
  tradeName: string;
}

/** VA descriptions look like "LISINOPRIL 10MG TAB"; match on the leading drug name. */
export function vaForDrug(rows: VaFile["rows"], names: string[]): VaPrice[] {
  const prefixes = names.map((n) => `${n.toUpperCase()} `);
  return rows
    .filter(([d]) => prefixes.some((p) => d.startsWith(p)))
    .map(([description, perUnit, unit, priceType, tradeName]) => ({ description, perUnit, unit, priceType, tradeName }))
    .sort((a, b) => a.perUnit - b.perUnit);
}

export interface PriceTrend {
  description: string;
  months: string[];
  values: (number | null)[];
  /** Change from the first to the last month with a price, as a fraction. */
  change?: number;
}

export function priceTrends(history: NadacHistoryFile, descriptions: string[]): PriceTrend[] {
  return descriptions.flatMap((d) => {
    const values = history.rows[d];
    if (!values) return [];
    const known = values.filter((v): v is number => v !== null);
    const change = known.length >= 2 && known[0] > 0 ? known[known.length - 1] / known[0] - 1 : undefined;
    return [{ description: d, months: history.months, values, change }];
  });
}

export interface Availability {
  genericMakers: number;
  biosimilars: string[];
  brandHolders: string[];
}

export interface CostDetails extends CostBundle {
  coverage: PlanCoverageSummary | null;
  partB: PartBLimit[];
  partBQuarter: string;
  partBSpending: PartBSpendingRow[];
  partBSpendingYear: number;
  negotiated: ReturnType<typeof negotiatedForDrug>;
  va: VaPrice[];
  vaAsOf: string;
  trends: PriceTrend[];
  availability: Availability | null;
  rxcuis: string[];
  marketplace: boolean;
}

/** The Costs tab's full data, built on the shared cost bundle (which the summary card also uses). */
export async function getCostDetails(bundle: CostBundle): Promise<CostDetails> {
  const base = { ...bundle, problems: [...bundle.problems] };
  const files = await loadExtraFiles();
  const names = [...new Set([base.drug, base.label?.genericName, ...(base.label?.brandNames ?? [])].filter((n): n is string => Boolean(n)).map((n) => n.toLowerCase()))];

  const [labels, apps, rxnorm] = await Promise.all([
    attempt("openFDA", base.problems, [], () => getLabels(base.drug)),
    attempt("openFDA (Drugs@FDA)", base.problems, [], () => applicationsForDrug([...new Set([base.label?.genericName, base.drug].filter((n): n is string => Boolean(n)))])),
    // All strengths and forms; a label lists only its own products, which can be an unusual form.
    attempt("RxNorm", base.problems, [] as string[], () => productRxcuis(base.drug)),
  ]);
  const rxcuis = [
    ...new Set([...rxnorm, ...(base.label?.rxcuis ?? []), ...labels.filter((l) => l.genericName === base.label?.genericName || l.genericName === base.drug).flatMap((l) => l.rxcuis)]),
  ];

  const single = apps.filter((a) => a.ingredients.some((i) => i.length === 1));
  const marketed = (type: string) => single.filter((a) => a.type === type && a.activeProducts > 0);
  const availability: Availability | null = single.length
    ? {
        genericMakers: new Set(marketed("ANDA").map((a) => a.sponsor)).size,
        // Biosimilars' ingredient names carry a four-letter suffix ("infliximab-dyyb").
        biosimilars: [...new Set(marketed("BLA").filter((a) => a.ingredients.some((i) => i.length === 1 && /-[a-z]{4}$/.test(i[0]))).flatMap((a) => a.brandNames))].sort(),
        brandHolders: [...new Set(single.filter((a) => a.type !== "ANDA").map((a) => a.sponsor))],
      }
    : null;

  const today = base.meta.importedAt || base.nadacAsOf;
  const productDescriptions = [...base.generic, ...base.brand].map((p) => p.description);
  return {
    ...base,
    coverage: files.coverage ? summarizePlanCoverage(files.coverage, rxcuis) : null,
    // Biosimilar billing codes carry only the product name ("Injection, inflectra").
    partB: files.partB ? partBForDrug(files.partB.rows, [...names, ...(availability?.biosimilars ?? []).map((b) => b.toLowerCase())]) : [],
    partBQuarter: files.partB?.quarter ?? "",
    partBSpending: files.partBSpending ? partBSpendingForDrug(files.partBSpending.rows, names) : [],
    partBSpendingYear: files.partBSpending?.year ?? 0,
    negotiated: files.negotiated ? negotiatedForDrug(files.negotiated.rows, base.label?.genericName ?? base.drug, base.label?.brandNames ?? [], today) : { all: [] },
    va: files.va ? vaForDrug(files.va.rows, names) : [],
    vaAsOf: files.va?.asOf ?? "",
    trends: files.history ? priceTrends(files.history, productDescriptions.slice(0, 12)) : [],
    availability,
    rxcuis,
    marketplace: marketplaceEnabled(),
  };
}
