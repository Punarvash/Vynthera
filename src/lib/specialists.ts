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

export interface SpecialistBundle {
  drug: string;
  condition?: string;
  filters: SpecialistFilters;
  /** Where the search ran, e.g. "Houston, TX" or "the United States". */
  where: string;
  /** Specialties that usually treat the condition. */
  specialties: string[];
  /** Drugs counted for "treats this condition" (CMS generic names). */
  conditionDrugs: string[];
  conditionExperts: Specialist[];
  drugExperts: Specialist[];
  administrators: Specialist[];
  trials: TrialSite[];
  dataYear?: number;
  partBYear?: number;
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

export async function getSpecialists(name: string, condition: string | undefined, filters: SpecialistFilters): Promise<SpecialistBundle> {
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
  const where = state ? [city, state].filter(Boolean).join(", ") : "the United States";

  const { partD, meta } = await loadCostFiles();
  const partBFile = await loadPartBLimits();
  const apiUrl = meta.prescribers?.apiUrl?.startsWith("https://data.cms.gov/") ? meta.prescribers.apiUrl : undefined;
  const partBApi = meta.partBProviders?.apiUrl?.startsWith("https://data.cms.gov/") ? meta.partBProviders.apiUrl : undefined;
  const drugGenerics = cmsGenericNames(partD.rows, drug).slice(0, 4);

  // Drugs commonly used for the condition: FDA-approved for it, plus this drug.
  const specialties = filters.specialty ? [filters.specialty] : specialtiesFor(condition);
  let conditionDrugs: string[] = [];
  if (condition) {
    const approved = await attempt("openFDA", problems, [] as string[], () => drugsByIndication(condition));
    const bases = [...new Set([drug, ...approved.map((n) => baseDrugName(n))])].slice(0, 10);
    conditionDrugs = [...new Set(bases.flatMap((b) => cmsGenericNames(partD.rows, b).slice(0, 2)))].slice(0, 8);
  }

  const place = { state, city };
  const [drugRows, conditionRows, partBRows, trials] = await Promise.all([
    apiUrl && drugGenerics.length
      ? attempt("CMS Part D Prescribers", problems, [] as RawPrescriberRow[], () =>
          topPrescribers(apiUrl, { generics: drugGenerics, ...place, types: filters.specialty ? [filters.specialty] : undefined }, 100),
        )
      : Promise.resolve([] as RawPrescriberRow[]),
    apiUrl && conditionDrugs.length && specialties.length
      ? attempt("CMS Part D Prescribers", problems, [] as RawPrescriberRow[], () =>
          topPrescribers(apiUrl, { generics: conditionDrugs, ...place, types: specialties }, 200),
        )
      : Promise.resolve([] as RawPrescriberRow[]),
    (async () => {
      const codes = partBFile ? partBForDrug(partBFile.rows, [drug, ...(label?.brandNames ?? []).map((b) => b.toLowerCase())]).map((r) => r.hcpcs) : [];
      if (!partBApi || codes.length === 0) return [] as RawServiceRow[];
      return attempt("CMS Physician & Other Practitioners", problems, [] as RawServiceRow[], () =>
        topAdministrators(partBApi, { hcpcs: codes.slice(0, 8), ...place, types: filters.specialty ? [filters.specialty] : undefined }, 100),
      );
    })(),
    attempt("ClinicalTrials.gov", problems, [] as TrialSite[], () => trialSites({ drug, condition, state, city })),
  ]);

  const drugExperts = aggregatePrescribers(drugRows).slice(0, MAX_SHOWN);
  const conditionExperts = aggregatePrescribers(conditionRows).slice(0, MAX_SHOWN);
  const administrators = aggregateAdministrators(partBRows).slice(0, MAX_SHOWN);

  // Contact details from the NPI Registry, once per clinician.
  const npis = [...new Set([...conditionExperts, ...drugExperts, ...administrators].map((x) => x.npi))].slice(0, 40);
  const providers = new Map<string, Provider | null>();
  const found = await inBatches(npis, 5, (npi) => attempt("NPI Registry", problems, null, () => providerByNpi(npi)));
  npis.forEach((npi, i) => providers.set(npi, found[i]));

  return {
    drug,
    condition,
    filters: { ...filters, state, city },
    where,
    specialties,
    conditionDrugs,
    conditionExperts: conditionExperts.map((experience) => ({ experience, provider: providers.get(experience.npi) ?? null })),
    drugExperts: drugExperts.map((experience) => ({ experience, provider: providers.get(experience.npi) ?? null })),
    administrators: administrators.map((administered) => ({ administered, provider: providers.get(administered.npi) ?? null })),
    trials,
    dataYear: meta.prescribers?.year,
    partBYear: meta.partBProviders?.year,
    problems: problems.filter((p, i) => problems.findIndex((q) => q.source === p.source) === i),
  };
}
