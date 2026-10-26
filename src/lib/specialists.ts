import { loadCostFiles } from "./costs";
import { attempt } from "./evidence";
import { baseDrugName, drugsByIndication, getLabel } from "./sources/openfda";
import { loadPartBLimits, partBForDrug } from "./cost-details";
import { specialtiesFor } from "./condition-specialties";
import type { PartDRow } from "./cost-data";
import { providerByNpi, type Provider } from "./sources/nppes";
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
  const specialties = filters.specialty ? [filters.specialty] : specialtiesFor(condition);
  let conditionDrugs: string[] = [];
  if (condition) {
    // Drugs commonly used for the condition: FDA-approved for it, plus this drug.
    const approved = await attempt("openFDA", problems, [] as string[], () => drugsByIndication(condition));
    const bases = [...new Set([drug, ...approved.map((n) => baseDrugName(n))])].slice(0, 10);
    conditionDrugs = [...new Set(bases.flatMap((b) => cmsGenericNames(partD.rows, b).slice(0, 2)))].slice(0, 8);
  }
  const names = [drug, ...(label?.brandNames ?? []).map((b) => b.toLowerCase())];
  return {
    drug,
    condition,
    filters: { ...filters, state, city },
    where: state ? [city, state].filter(Boolean).join(", ") : "the United States",
    specialties,
    drugGenerics: cmsGenericNames(partD.rows, drug).slice(0, 4),
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

/** Dentists prescribe many antibiotics but are not who a physician refers to for a second opinion. */
const NOT_FOR_REFERRAL = /^(dentist|oral surgery|student in an organized|clinic\/center|pharmacist)/i;

/** Clinicians of the matching specialties who prescribe the condition's drugs most. */
export async function conditionExperts(ctx: SpecialistContext): Promise<SectionResult<Specialist>> {
  const problems: SourceProblem[] = [];
  if (!ctx.apiUrl || ctx.conditionDrugs.length === 0 || ctx.specialties.length === 0) return { items: [], problems };
  const { state, city } = ctx.filters;
  const rows = await attempt("CMS Part D Prescribers", problems, [] as RawPrescriberRow[], () =>
    topPrescribers(ctx.apiUrl as string, { generics: ctx.conditionDrugs, state, city, types: ctx.specialties }, 200),
  );
  const top = aggregatePrescribers(rows).slice(0, MAX_SHOWN);
  return { items: (await withProviders(top, problems)).map(({ row, provider }) => ({ experience: row, provider })), problems };
}

/** Clinicians who prescribe the drug most (Medicare Part D). */
export async function drugExperts(ctx: SpecialistContext): Promise<SectionResult<Specialist>> {
  const problems: SourceProblem[] = [];
  if (!ctx.apiUrl || ctx.drugGenerics.length === 0) return { items: [], problems };
  const { state, city, specialty } = ctx.filters;
  const rows = await attempt("CMS Part D Prescribers", problems, [] as RawPrescriberRow[], () =>
    topPrescribers(ctx.apiUrl as string, { generics: ctx.drugGenerics, state, city, types: specialty ? [specialty] : undefined }, 100),
  );
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
