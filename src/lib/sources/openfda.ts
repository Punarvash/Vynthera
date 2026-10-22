import { cacheLife } from "next/cache";
import { getJson } from "../http";
import { asArray, compactDateToIso, titleCase } from "../text";
import type { DrugLabel } from "../types";

// openFDA drug label API: https://open.fda.gov/apis/drug/label/
const BASE = "https://api.fda.gov/drug/label.json";
const SOURCE = "openFDA";

interface RawLabel {
  set_id?: string;
  effective_time?: string;
  indications_and_usage?: string[];
  mechanism_of_action?: string[];
  nonclinical_toxicology?: string[];
  carcinogenesis_and_mutagenesis_and_impairment_of_fertility?: string[];
  openfda?: {
    generic_name?: string[];
    brand_name?: string[];
    manufacturer_name?: string[];
    pharm_class_moa?: string[];
    pharm_class_epc?: string[];
    route?: string[];
  };
}

interface RawLabelResponse {
  meta?: { results?: { total?: number } };
  results?: RawLabel[];
}

function quote(term: string): string {
  return encodeURIComponent(`"${term.replace(/"/g, "")}"`);
}

/** openFDA treats `+` between clauses as OR. */
function labelUrl(clauses: string[], limit: number): string {
  const key = process.env.OPENFDA_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENFDA_API_KEY)}` : "";
  return `${BASE}?search=${clauses.join("+")}&limit=${limit}${key}`;
}

/** Strip the leading "1 INDICATIONS AND USAGE" style heading from a label section. */
export function stripSectionHeading(text: string, heading: RegExp): string {
  return text.replace(new RegExp(`^\\s*[\\d.]*\\s*${heading.source}\\s*:?\\s*`, "i"), "").trim();
}

export function toDrugLabel(raw: RawLabel): DrugLabel | null {
  const o = raw.openfda;
  const generic = o?.generic_name?.[0];
  if (!o || !generic || !raw.set_id) return null;
  const tox = raw.nonclinical_toxicology?.[0] ?? raw.carcinogenesis_and_mutagenesis_and_impairment_of_fertility?.[0];
  return {
    genericName: generic.toLowerCase(),
    brandNames: [...new Set(asArray(o.brand_name).map(titleCase))],
    manufacturer: o.manufacturer_name?.[0] ?? "Not listed",
    indications: stripSectionHeading(raw.indications_and_usage?.join(" ") ?? "", /INDICATIONS\s*(AND|&)\s*USAGE/),
    mechanism: raw.mechanism_of_action?.[0]
      ? stripSectionHeading(raw.mechanism_of_action[0], /MECHANISM\s+OF\s+ACTION/)
      : undefined,
    pharmClassMoa: asArray(o.pharm_class_moa),
    pharmClassEpc: asArray(o.pharm_class_epc),
    toxicology: tox,
    routes: asArray(o.route),
    setId: raw.set_id,
    effectiveDate: compactDateToIso(raw.effective_time),
    dailyMedUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(raw.set_id)}`,
  };
}

const SALT_WORDS =
  /\b(hydrochloride|hcl|hydrobromide|sodium|potassium|calcium|magnesium|sulfate|sulphate|phosphate|acetate|citrate|maleate|mesylate|besylate|tartrate|succinate|fumarate|bromide|chloride|monohydrate|dihydrate|anhydrous|extended-release|er)\b/g;

/** "Metformin Hydrochloride" -> "metformin", so a search for the base drug name matches its salt forms. */
export function baseDrugName(name: string): string {
  return name.toLowerCase().replace(SALT_WORDS, "").replace(/\s+/g, " ").trim();
}

/** True when a query names this label's drug (generic, base name without salt, or brand). */
export function namesDrug(label: DrugLabel, query: string): boolean {
  const q = query.trim().toLowerCase();
  return label.genericName === q || baseDrugName(label.genericName) === baseDrugName(q) || label.brandNames.some((b) => b.toLowerCase() === q);
}

/**
 * Choose the most useful label among many (generics share a drug name):
 * exact single-ingredient name match first, then labels with a mechanism section, then newest.
 */
export function pickBestLabel(labels: DrugLabel[], query: string): DrugLabel | null {
  const q = query.trim().toLowerCase();
  const score = (l: DrugLabel) =>
    (l.genericName === q ? 5 : namesDrug(l, q) ? 4 : 0) +
    (l.genericName.includes(" and ") || l.genericName.includes(",") ? 0 : 2) +
    (l.mechanism ? 1 : 0);
  return (
    [...labels].sort(
      (a, b) => score(b) - score(a) || (b.effectiveDate ?? "").localeCompare(a.effectiveDate ?? ""),
    )[0] ?? null
  );
}

async function searchLabels(clauses: string[], limit: number): Promise<DrugLabel[]> {
  const data = await getJson<RawLabelResponse>(SOURCE, labelUrl(clauses, limit), { notFoundAs: {} });
  return (data.results ?? []).map(toDrugLabel).filter((l): l is DrugLabel => l !== null);
}

/** All labels for a drug by generic or brand name. */
export async function getLabels(name: string): Promise<DrugLabel[]> {
  "use cache";
  cacheLife("days");
  return searchLabels([`openfda.generic_name:${quote(name)}`, `openfda.brand_name:${quote(name)}`], 25);
}

export async function getLabel(name: string): Promise<DrugLabel | null> {
  return pickBestLabel(await getLabels(name), name);
}

function uniqueGenericNames(labels: DrugLabel[]): string[] {
  return [...new Set(labels.map((l) => l.genericName))].sort();
}

/** Drugs whose FDA pharmacologic class matches a mechanism, e.g. "DPP-4 inhibitor". */
export async function drugsByMechanism(term: string): Promise<{ name: string; classes: string[] }[]> {
  "use cache";
  cacheLife("days");
  const labels = await searchLabels(
    [`openfda.pharm_class_moa:${quote(term)}`, `openfda.pharm_class_epc:${quote(term)}`],
    100,
  );
  const byName = new Map<string, Set<string>>();
  for (const l of labels) {
    const set = byName.get(l.genericName) ?? new Set();
    [...l.pharmClassMoa, ...l.pharmClassEpc].forEach((c) => set.add(c));
    byName.set(l.genericName, set);
  }
  return uniqueGenericNames(labels).map((name) => ({ name, classes: [...(byName.get(name) ?? [])] }));
}

/** Drugs whose FDA label indications mention a condition (on-label use). */
export async function drugsByIndication(condition: string): Promise<string[]> {
  "use cache";
  cacheLife("days");
  return uniqueGenericNames(await searchLabels([`indications_and_usage:${quote(condition)}`], 100));
}
