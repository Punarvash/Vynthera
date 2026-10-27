import { cacheLife } from "next/cache";
import { getJson } from "../http";
import { asArray, compactDateToIso, stripTags, titleCase } from "../text";
import type { DrugLabel, LabelTable } from "../types";

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
  dosage_and_administration?: string[];
  adverse_reactions?: string[];
  adverse_reactions_table?: string[];
  boxed_warning?: string[];
  warnings_and_cautions?: string[];
  warnings?: string[];
  contraindications?: string[];
  pregnancy?: string[];
  lactation?: string[];
  nursing_mothers?: string[];
  pediatric_use?: string[];
  geriatric_use?: string[];
  use_in_specific_populations?: string[];
  drug_interactions?: string[];
  overdosage?: string[];
  pharmacokinetics?: string[];
  storage_and_handling?: string[];
  how_supplied?: string[];
  information_for_patients?: string[];
  spl_medguide?: string[];
  spl_patient_package_insert?: string[];
  purpose?: string[];
  when_using?: string[];
  do_not_use?: string[];
  ask_doctor?: string[];
  ask_doctor_or_pharmacist?: string[];
  stop_use?: string[];
  dosage_and_administration_table?: string[];
  controlled_substance?: string[];
  openfda?: {
    rxcui?: string[];
    application_number?: string[];
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

/** Turn a label's HTML table into rows of plain-text cells; the HTML itself is never rendered. */
export function parseLabelTable(html: string | undefined, maxRows = 30): LabelTable | undefined {
  if (!html) return undefined;
  const caption = html.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1];
  const rows = (html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [])
    .map((tr) => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => stripTags(m[1])).slice(0, 8))
    .filter((cells) => cells.some(Boolean))
    .slice(0, maxRows);
  return rows.length > 1 ? { caption: caption ? stripTags(caption) : undefined, rows } : undefined;
}

function section(raw: string[] | undefined, heading: RegExp): string | undefined {
  const text = raw ? stripTags(raw.join(" ")) : "";
  return text ? stripSectionHeading(text, heading) : undefined;
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
    brandNames: [...new Set(asArray(o.brand_name).map(titleCase))].filter(
      (b) => baseDrugName(b) !== baseDrugName(generic) && b.toLowerCase() !== generic.toLowerCase(),
    ),
    manufacturer: o.manufacturer_name?.[0] ?? "Not listed",
    indications: section(raw.indications_and_usage, /INDICATIONS\s*(AND|&)\s*USAGE/) ?? "",
    mechanism: section(raw.mechanism_of_action, /MECHANISM\s+OF\s+ACTION/),
    pharmClassMoa: asArray(o.pharm_class_moa),
    pharmClassEpc: asArray(o.pharm_class_epc),
    toxicology: tox ? section([tox], /NONCLINICAL\s+TOXICOLOGY/) : undefined,
    routes: asArray(o.route),
    rxcuis: asArray(o.rxcui),
    applicationNumbers: asArray(o.application_number),
    dosage: section(raw.dosage_and_administration, /DOSAGE\s*(AND|&)\s*ADMINISTRATION/),
    adverseReactions: section(raw.adverse_reactions, /ADVERSE\s+REACTIONS/),
    adverseTable: parseLabelTable(raw.adverse_reactions_table?.[0]),
    boxedWarning: section(raw.boxed_warning, /(BOXED\s+)?WARNING:?/),
    warnings: section(raw.warnings_and_cautions ?? raw.warnings, /WARNINGS(\s*(AND|&)\s*PRECAUTIONS)?/),
    contraindications: section(raw.contraindications, /CONTRAINDICATIONS/),
    pregnancy: section(raw.pregnancy, /(8\.1\s*)?PREGNANCY/),
    lactation: section(raw.lactation ?? raw.nursing_mothers, /(8\.[23]\s*)?(LACTATION|NURSING MOTHERS)/),
    pediatricUse: section(raw.pediatric_use, /(8\.4\s*)?PEDIATRIC USE/),
    geriatricUse: section(raw.geriatric_use, /(8\.5\s*)?GERIATRIC USE/),
    specificPopulations: section(raw.use_in_specific_populations, /USE IN SPECIFIC POPULATIONS/),
    interactions: section(raw.drug_interactions, /DRUG INTERACTIONS/),
    overdosage: section(raw.overdosage, /OVERDOSAGE/),
    pharmacokinetics: section(raw.pharmacokinetics, /(12\.3\s*)?PHARMACOKINETICS/),
    storage: section(raw.storage_and_handling, /STORAGE AND HANDLING/),
    howSupplied: section(raw.how_supplied, /HOW SUPPLIED(\/STORAGE AND HANDLING)?/),
    patientCounseling: section(raw.information_for_patients, /(17\s*)?PATIENT COUNSELING INFORMATION|INFORMATION FOR PATIENTS/),
    medGuide: raw.spl_medguide || raw.spl_patient_package_insert ? stripTags((raw.spl_medguide ?? raw.spl_patient_package_insert ?? []).join(" ")) : undefined,
    otc: raw.purpose || raw.do_not_use || raw.stop_use
      ? {
          purpose: section(raw.purpose, /PURPOSES?/),
          whenUsing: section(raw.when_using, /WHEN USING THIS PRODUCT/),
          doNotUse: section(raw.do_not_use, /DO NOT USE/),
          askDoctor: section(raw.ask_doctor ?? raw.ask_doctor_or_pharmacist, /ASK A DOCTOR( OR PHARMACIST)?( BEFORE USE IF YOU HAVE)?/),
          stopUse: section(raw.stop_use, /STOP USE AND ASK A DOCTOR IF/),
          directions: section(raw.dosage_and_administration, /DIRECTIONS/),
        }
      : undefined,
    controlledSubstance: raw.controlled_substance ? stripTags(raw.controlled_substance.join(" ")).match(/\bC(I{1,3}V?|IV|V)\b/)?.[0] : undefined,
    setId: raw.set_id,
    effectiveDate: compactDateToIso(raw.effective_time),
    dailyMedUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(raw.set_id)}`,
  };
}

const SALT_WORDS =
  /\b(hydrochloride|hcl|hydrobromide|sodium|potassium|calcium|magnesium|sulfate|sulphate|phosphate|acetate|citrate|maleate|mesylate|besylate|tartrate|succinate|fumarate|bromide|chloride|monohydrate|dihydrate|anhydrous|extended-release|er)\b/g;

/** Dosage forms and routes that FDA generic names sometimes include ("riboflavin 5'-phosphate ophthalmic"). */
const FORM_WORDS =
  /\b(ophthalmic|otic|nasal|topical|oral|injection|injectable|intravenous|subcutaneous|solution|suspension|tablets?|capsules?|cream|ointment|gel|lotion|spray|patch|inhalation|inhaler|powder|drops|kit|delayed-release|for)\b/g;

/**
 * "Metformin Hydrochloride" -> "metformin"; "Riboflavin 5'-Phosphate Ophthalmic" -> "riboflavin".
 * Salt, form and route words are dropped, then leftover fragments with no letters ("5'-").
 */
export function baseDrugName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(SALT_WORDS, " ")
    .replace(FORM_WORDS, " ")
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  return words.length ? words.join(" ").replace(/[-,]+$/, "").trim() : name.toLowerCase().trim();
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
/** Repackagers and relabelers publish copies of the original label; prefer the manufacturer's own. */
const REPACKAGER =
  /repack|relabel|pharmacy|bryant ranch|proficient rx|preferred pharmaceuticals|a-s medication|nucare|direct[_ ]?rx|quality care|aphena|lake erie|henry schein|unit dose services|asclemed|denton|medsource|rebel distributors|aidarex|northwind|blenheim|golden state medical|pd-rx|physicians total care|stat rx|dispensing solutions|liberty pharmaceuticals|safecor|american health packaging|cardinal health|mckesson|major pharmaceuticals|marlex|harkins|altura|legacy pharmaceutical packaging|clinical solutions wholesale|advanced rx|readymeds|coupler|quallent|chartwell rx|medvantx|nostrum/i;

export function isRepackager(manufacturer: string): boolean {
  return REPACKAGER.test(manufacturer);
}

/**
 * Choose the most useful label among many (generics, repackagers and biosimilars share a name):
 * exact name match, single ingredient, brand (NDA/BLA) holder, not a repackager, has a mechanism section; then newest.
 */
export function pickBestLabel(labels: DrugLabel[], query: string): DrugLabel | null {
  const q = query.trim().toLowerCase();
  const score = (l: DrugLabel) =>
    (l.genericName === q ? 5 : namesDrug(l, q) ? 4 : 0) +
    (l.genericName.includes(" and ") || l.genericName.includes(",") ? 0 : 2) +
    (l.applicationNumbers.some((n) => /^(NDA|BLA)/.test(n)) ? 3 : 0) +
    // Biosimilars (351(k)) carry BLA numbers from 761000 up; the reference biologic's is lower.
    (l.applicationNumbers.some((n) => /^BLA\d+$/.test(n) && Number(n.slice(3)) < 761000) ? 2 : 0) +
    // A distinct brand (Humira) rather than a suffixed nonproprietary name (adalimumab-aacf).
    (l.brandNames.some((b) => !b.toLowerCase().includes(baseDrugName(l.genericName))) ? 1 : 0) +
    (isRepackager(l.manufacturer) ? -4 : 0) +
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
  // Exact-name labels first (e.g. "adalimumab" itself, not only its biosimilars), then a broader match.
  const upper = name.trim().toUpperCase();
  const [exact, broad] = await Promise.all([
    searchLabels([`openfda.generic_name.exact:${quote(upper)}`, `openfda.brand_name.exact:${quote(upper)}`], 20),
    searchLabels([`openfda.generic_name:${quote(name)}`, `openfda.brand_name:${quote(name)}`], 25),
  ]);
  const seen = new Set<string>();
  return [...exact, ...broad].filter((l) => (seen.has(l.setId) ? false : (seen.add(l.setId), true)));
}

export async function getLabel(name: string): Promise<DrugLabel | null> {
  return pickBestLabel(await getLabels(name), name);
}

/** Edit distance, to merge FDA data-entry typos ("clomiphene citrtae") into the common spelling. */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

export function uniqueGenericNames(labels: DrugLabel[]): string[] {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l.genericName, (counts.get(l.genericName) ?? 0) + 1);
  // Most common spelling first, so a rare misspelling folds into it.
  const names = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const kept: string[] = [];
  for (const n of names) {
    if (!kept.some((k) => k.split(" ")[0] === n.split(" ")[0] && editDistance(k, n) <= 2)) kept.push(n);
  }
  return kept.sort();
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
