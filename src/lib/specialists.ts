import { loadCostFiles } from "./costs";
import { attempt } from "./evidence";
import { baseDrugName, drugsByIndication, getLabel } from "./sources/openfda";
import { loadPartBLimits, loadTopPrescribers, partBForDrug } from "./cost-details";
import { specialtiesFor } from "./condition-specialties";
import type { PartDRow, TopEntry, TopPrescribersFile } from "./cost-data";
import { providerByNpi, providersByName, searchProviders, type Provider } from "./sources/nppes";
import { recentUsAuthorships, type Authorship } from "./sources/pubmed";
import { groupAuthors, type ResearchAuthor } from "./research-authors";
import { aggregatePrescribers, topPrescribers, type PrescriberExperience, type RawPrescriberRow } from "./sources/prescribers";
import { aggregateAdministrators, topAdministrators, type Administrator, type RawServiceRow } from "./sources/partb-providers";
import { trialSites, type TrialSite } from "./sources/trial-sites";
import { placeForZip } from "./sources/zip";
import type { SourceProblem } from "./types";

/** Prescriber types as CMS writes them, so the specialty filter matches the data exactly. */
export const SPECIALTIES = [
  "Allergy/ Immunology",
  "Cardiology",
  "Dermatology",
  "Endocrinology",
  "Family Practice",
  "Gastroenterology",
  "Geriatric Medicine",
  "Hematology-Oncology",
  "Infectious Disease",
  "Internal Medicine",
  "Medical Oncology",
  "Nephrology",
  "Neurology",
  "Obstetrics & Gynecology",
  "Ophthalmology",
  "Otolaryngology",
  "Pain Management",
  "Pediatric Medicine",
  "Psychiatry",
  "Pulmonary Disease",
  "Rheumatology",
  "Urology",
];

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export interface SpecialistFilters {
  state?: string;
  city?: string;
  zip?: string;
  specialty?: string;
  /** Page of the NPI Registry directory (1-based). */
  page?: number;
}

export function cleanFilters(sp: Record<string, string | string[] | undefined>): SpecialistFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();
  const state = one(sp.state)?.toUpperCase();
  const specialty = one(sp.specialty);
  const zip = one(sp.zip)?.replace(/\D/g, "").slice(0, 5);
  return {
    state: state && US_STATES.includes(state) ? state : undefined,
    city: one(sp.city)?.replace(/[^\p{L} .'-]/gu, "").slice(0, 60) || undefined,
    zip: zip && zip.length === 5 ? zip : undefined,
    specialty: specialty && SPECIALTIES.includes(specialty) ? specialty : undefined,
    page: one(sp.page) ? Math.min(40, Math.max(1, Number(one(sp.page)) || 1)) : undefined,
  };
}

export interface Specialist {
  provider: Provider | null;
  /** Medicare Part D prescribing of the drug (or of the condition's drugs, for the condition list). */
  experience?: PrescriberExperience;
  /** Medicare Part B: the clinician gave the drug in a clinic. */
  administered?: Administrator;
}

/** What every Specialists section needs: the drug, the place and the matching rules. Quick to build. */
export interface SpecialistContext {
  drug: string;
  condition?: string;
  filters: SpecialistFilters;
  /** Where the search runs, e.g. "Houston, TX" or "the United States". */
  where: string;
  /** Specialties that usually treat the condition (or the one chosen). */
  specialties: string[];
  /** Specialties for the full directory: the ones above, or for a drug alone the specialties that prescribe it most. */
  directorySpecialties: string[];
  /** Names of the drug for literature searches (generic, salt, brands). */
  drugNames: string[];
  /** CMS generic names of the drug, for Part D. */
  drugGenerics: string[];
  /** Drugs counted for "treats this condition" (CMS generic names). */
  conditionDrugs: string[];
  /** Part B billing codes for the drug (clinic-given drugs). */
  partBCodes: string[];
  apiUrl?: string;
  partBApi?: string;
  dataYear?: number;
  partBYear?: number;
  problems: SourceProblem[];
}

export interface SectionResult<T> {
  items: T[];
  problems: SourceProblem[];
  /** Shown above the list, e.g. when Medicare data was unavailable and the list comes from the NPI Registry. */
  note?: string;
}

const MAX_SHOWN = 15;

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** CMS writes generic names its own way ("Metformin HCl"); take them from the imported Part D data. */
function cmsGenericNames(rows: PartDRow[], base: string): string[] {
  return [...new Set(rows.filter((r) => baseDrugName(r.generic) === base).map((r) => r.generic))];
}

export async function getSpecialistContext(name: string, condition: string | undefined, filters: SpecialistFilters): Promise<SpecialistContext> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();

  // A ZIP code fills in the state and city.
  let { state, city } = filters;
  if (filters.zip && !state) {
    const place = await attempt("ZIP lookup", problems, null, () => placeForZip(filters.zip as string));
    if (place) {
      state = place.state;
      city ??= place.city;
    }
  }

  const { partD, meta } = await loadCostFiles();
  const partBFile = await loadPartBLimits();
  // The prescriber data spells some generics differently ("Metformin Hcl" vs "Metformin HCl"); use its spelling.
  const index = await loadTopPrescribers();
  const spelling = new Map(Object.keys(index?.drugs ?? {}).map((k) => [k.toLowerCase(), k]));
  const asPrescribed = (names: string[]) => [...new Set(names.map((n) => spelling.get(n.toLowerCase()) ?? n))];
  const specialties = filters.specialty ? [filters.specialty] : specialtiesFor(condition);
  let conditionDrugs: string[] = [];
  if (condition) {
    // Drugs commonly used for the condition: FDA-approved for it, plus this drug.
    const approved = await attempt("openFDA", problems, [] as string[], () => drugsByIndication(condition));
    const bases = [...new Set([drug, ...approved.map((n) => baseDrugName(n))])].slice(0, 10);
    conditionDrugs = asPrescribed(bases.flatMap((b) => cmsGenericNames(partD.rows, b).slice(0, 2))).slice(0, 8);
  }
  const names = [drug, ...(label?.brandNames ?? []).map((b) => b.toLowerCase())];
  const drugGenerics = asPrescribed(cmsGenericNames(partD.rows, drug)).slice(0, 4);
  return {
    drug,
    condition,
    filters: { ...filters, state, city },
    where: state ? [city, state].filter(Boolean).join(", ") : "the United States",
    specialties,
    directorySpecialties: specialties.length ? specialties : index ? typesForDrug(index, drugGenerics) : [],
    drugNames: [...new Set(names)].slice(0, 6),
    drugGenerics,
    conditionDrugs,
    partBCodes: partBFile ? partBForDrug(partBFile.rows, names).map((r) => r.hcpcs).slice(0, 8) : [],
    apiUrl: meta.prescribers?.apiUrl?.startsWith("https://data.cms.gov/") ? meta.prescribers.apiUrl : undefined,
    partBApi: meta.partBProviders?.apiUrl?.startsWith("https://data.cms.gov/") ? meta.partBProviders.apiUrl : undefined,
    dataYear: meta.prescribers?.year,
    partBYear: meta.partBProviders?.year,
    problems,
  };
}

/** Contact details from the NPI Registry for each clinician. */
async function withProviders<T extends { npi: string }>(list: T[], problems: SourceProblem[]): Promise<{ row: T; provider: Provider | null }[]> {
  const found = await inBatches(list, 5, (r) => attempt("NPI Registry", problems, null, () => providerByNpi(r.npi)));
  return list.map((row, i) => ({ row, provider: found[i] }));
}

/**
 * Prescribers from the weekly nationwide index (data/costs/prescribers-top.json): the most experienced prescribers
 * of each drug, summed over the given drugs. With `types`, only those prescriber types.
 */
export function fromTopIndex(file: TopPrescribersFile, generics: string[], types?: string[]): PrescriberExperience[] {
  const byNpi = new Map<string, PrescriberExperience>();
  for (const g of generics) {
    const d = file.drugs[g];
    if (!d) continue;
    const lists: TopEntry[][] = types?.length ? types.map((t) => d.types[t] ?? []) : [d.all];
    for (const [npi, claims, benes] of lists.flat()) {
      const person = file.people[npi];
      if (!person) continue;
      const [first, last, city, state, type] = person;
      const p = byNpi.get(npi) ?? { npi, name: [first, last].filter(Boolean).join(" "), city, state, type, claims: 0, brands: [] };
      p.claims += claims;
      if (benes) p.patients = Math.max(p.patients ?? 0, benes);
      if (!p.brands.includes(g)) p.brands.push(g);
      byNpi.set(npi, p);
    }
  }
  return [...byNpi.values()].sort((a, b) => b.claims - a.claims);
}

/** The specialties (from the list above) that prescribe the drug most nationwide, for the directory. */
export function typesForDrug(file: TopPrescribersFile, generics: string[], max = 3): string[] {
  const claims = new Map<string, number>();
  for (const g of generics) for (const [type, list] of Object.entries(file.drugs[g]?.types ?? {})) claims.set(type, (claims.get(type) ?? 0) + list.reduce((n, e) => n + e[1], 0));
  // Primary care prescribes nearly everything; list it after the specialists unless nothing else prescribes the drug.
  const primary = new Set(["Family Practice", "Internal Medicine"]);
  const ranked = [...claims.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const specialists = ranked.filter((t) => !primary.has(t));
  return [...specialists, ...ranked.filter((t) => primary.has(t))].slice(0, max);
}

/** NPI Registry taxonomy names for CMS prescriber types where the two differ. */
const NPPES_TAXONOMY: Record<string, string> = {
  "Allergy/ Immunology": "Allergy & Immunology",
  "Family Practice": "Family Medicine",
  "Hematology-Oncology": "Hematology & Oncology",
  "Pain Management": "Pain Medicine",
  "Pediatric Medicine": "Pediatrics",
};

export function nppesTaxonomy(cmsType: string): string {
  return NPPES_TAXONOMY[cmsType] ?? cmsType;
}

/** Clinicians of the specialties near the place, from the NPI Registry (no prescribing counts), alternating specialties. */
async function registryFallback(ctx: SpecialistContext, problems: SourceProblem[]): Promise<Specialist[]> {
  const { state, city } = ctx.filters;
  if (!state || ctx.specialties.length === 0) return [];
  const lists = await Promise.all(
    ctx.specialties.map((t) => attempt("NPI Registry", problems, [] as Provider[], () => searchProviders({ specialty: nppesTaxonomy(t), state, city }))),
  );
  const out: Specialist[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < MAX_SHOWN && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const p = l[i];
      if (p && !seen.has(p.npi) && out.length < MAX_SHOWN) {
        seen.add(p.npi);
        out.push({ provider: p });
      }
    }
  }
  return out;
}

const CMS_BUSY = "Medicare's prescribing data service is busy right now, so this list comes from the NPI Registry";

/** Live data.cms.gov search; on failure, the problem is recorded and `failed` is set. */
async function livePrescribers(ctx: SpecialistContext, params: Parameters<typeof topPrescribers>[1], size: number, problems: SourceProblem[]) {
  let failed = false;
  const rows = await attempt("CMS Part D Prescribers", problems, [] as RawPrescriberRow[], async () => {
    try {
      return await topPrescribers(ctx.apiUrl as string, params, size);
    } catch (err) {
      failed = true;
      throw err;
    }
  });
  return { rows, failed };
}

/**
 * Prescriber types that are not who a physician refers to for a second opinion on a drug: dentists (CMS files many
 * under "Maxillofacial Surgery") and surgeons who give antibiotics around procedures, among others.
 */
export const NOT_FOR_REFERRAL = /^(dentist|dental|oral|maxillofacial|orthopedic surgery|micrographic dermatologic surgery|student in an organized|clinic\/center|pharmacist)/i;

/** Clinicians of the matching specialties who prescribe the condition's drugs most. */
export async function conditionExperts(ctx: SpecialistContext): Promise<SectionResult<Specialist>> {
  const problems: SourceProblem[] = [];
  if (ctx.conditionDrugs.length === 0 || ctx.specialties.length === 0) return { items: [], problems };
  const { state, city } = ctx.filters;
  if (!state) {
    // Nationwide: the weekly index, so no live query is needed.
    const index = await loadTopPrescribers();
    const top = index ? fromTopIndex(index, ctx.conditionDrugs, ctx.specialties).slice(0, MAX_SHOWN) : [];
    if (top.length) return { items: (await withProviders(top, problems)).map(({ row, provider }) => ({ experience: row, provider })), problems };
  }
  if (!ctx.apiUrl) return { items: [], problems };
  const { rows, failed } = await livePrescribers(ctx, { generics: ctx.conditionDrugs, state, city, types: ctx.specialties }, 200, problems);
  if (failed) {
    const items = await registryFallback(ctx, problems);
    if (items.length) {
      // The registry list replaces the Medicare one, so the Medicare error is explained by the note instead.
      return { items, problems: problems.filter((p) => p.source !== "CMS Part D Prescribers"), note: `${CMS_BUSY}: ${ctx.specialties.join(", ")} clinicians in ${ctx.where}, without prescription counts. Try again in a few minutes for the ranked list.` };
    }
  }
  const top = aggregatePrescribers(rows).slice(0, MAX_SHOWN);
  return { items: (await withProviders(top, problems)).map(({ row, provider }) => ({ experience: row, provider })), problems };
}

/** Clinicians who prescribe the drug most (Medicare Part D). */
export async function drugExperts(ctx: SpecialistContext): Promise<SectionResult<Specialist>> {
  const problems: SourceProblem[] = [];
  if (ctx.drugGenerics.length === 0) return { items: [], problems };
  const { state, city, specialty } = ctx.filters;
  if (!state) {
    const index = await loadTopPrescribers();
    const top = index
      ? fromTopIndex(index, ctx.drugGenerics, specialty ? [specialty] : undefined)
          .filter((p) => specialty || !NOT_FOR_REFERRAL.test(p.type))
          .slice(0, MAX_SHOWN)
      : [];
    if (top.length) return { items: (await withProviders(top, problems)).map(({ row, provider }) => ({ experience: row, provider })), problems };
  }
  if (!ctx.apiUrl) return { items: [], problems };
  const { rows, failed } = await livePrescribers(ctx, { generics: ctx.drugGenerics, state, city, types: specialty ? [specialty] : undefined }, 100, problems);
  if (failed && specialty) {
    const items = await registryFallback(ctx, problems);
    if (items.length) {
      return { items, problems: problems.filter((p) => p.source !== "CMS Part D Prescribers"), note: `${CMS_BUSY}: ${specialty} clinicians in ${ctx.where}, without prescription counts. Try again in a few minutes for the ranked list.` };
    }
  }
  const top = aggregatePrescribers(rows)
    .filter((p) => specialty || !NOT_FOR_REFERRAL.test(p.type))
    .slice(0, MAX_SHOWN);
  return { items: (await withProviders(top, problems)).map(({ row, provider }) => ({ experience: row, provider })), problems };
}

/** Clinicians who gave the drug in a clinic most (Medicare Part B). */
export async function clinicAdministrators(ctx: SpecialistContext): Promise<SectionResult<Specialist>> {
  const problems: SourceProblem[] = [];
  if (!ctx.partBApi || ctx.partBCodes.length === 0) return { items: [], problems };
  const { state, city, specialty } = ctx.filters;
  const rows = await attempt("CMS Physician & Other Practitioners", problems, [] as RawServiceRow[], () =>
    topAdministrators(ctx.partBApi as string, { hcpcs: ctx.partBCodes, state, city, types: specialty ? [specialty] : undefined }, 100),
  );
  const top = aggregateAdministrators(rows).slice(0, MAX_SHOWN);
  return { items: (await withProviders(top, problems)).map(({ row, provider }) => ({ administered: row, provider })), problems };
}

export async function trialInvestigators(ctx: SpecialistContext): Promise<SectionResult<TrialSite>> {
  const problems: SourceProblem[] = [];
  const { state, city } = ctx.filters;
  const items = await attempt("ClinicalTrials.gov", problems, [] as TrialSite[], () => trialSites({ drug: ctx.drug, condition: ctx.condition, state, city }));
  return { items, problems };
}

export interface PublishedAuthor {
  author: ResearchAuthor;
  /** NPI Registry record when exactly one clinician with this name is registered in the author's state. */
  provider: Provider | null;
}

/** Clinicians who led recent US studies of the drug (and condition): experience beyond Medicare. */
export async function publishedAuthors(ctx: SpecialistContext): Promise<SectionResult<PublishedAuthor>> {
  const problems: SourceProblem[] = [];
  // Recent: about the last six years, counted from the Medicare data year (no clock reads during rendering).
  const since = (ctx.dataYear ?? 2024) - 4;
  const rows = await attempt("PubMed", problems, [] as Authorship[], () => recentUsAuthorships(ctx.drugNames, ctx.condition, since));
  const top = groupAuthors(rows, ctx.filters.state).slice(0, 12);
  const matched = await inBatches(top, 4, async (author) => {
    if (!author.state) return null;
    const first = author.fore.split(/\s+/)[0];
    const found = await attempt("NPI Registry", problems, [] as Provider[], () => providersByName({ first, last: author.last, state: author.state as string }));
    return found.length === 1 ? found[0] : null;
  });
  return { items: top.map((author, i) => ({ author, provider: matched[i] })), problems };
}

export const DIRECTORY_PAGE = 24;

/** Every clinician of the matching specialties near the place, from the NPI Registry (all payers, not only Medicare). */
export async function directory(ctx: SpecialistContext): Promise<SectionResult<Provider> & { hasMore: boolean }> {
  const problems: SourceProblem[] = [];
  const { state, city, page = 1 } = ctx.filters;
  const types = ctx.directorySpecialties;
  if (!state || types.length === 0) return { items: [], problems, hasMore: false };
  const per = Math.ceil(DIRECTORY_PAGE / types.length);
  const lists = await Promise.all(
    types.map((t) =>
      attempt("NPI Registry", problems, [] as Provider[], () => searchProviders({ specialty: nppesTaxonomy(t), state, city, limit: per + 1, skip: (page - 1) * per })),
    ),
  );
  const seen = new Set<string>();
  const items: Provider[] = [];
  for (let i = 0; i < per + 1; i++) {
    for (const l of lists) {
      const p = l[i];
      if (p && i < per && !seen.has(p.npi)) {
        seen.add(p.npi);
        items.push(p);
      }
    }
  }
  return { items, problems, hasMore: lists.some((l) => l.length > per) };
}
