import { loadCostFiles } from "./costs";
import { attempt } from "./evidence";
import { baseDrugName, getLabel } from "./sources/openfda";
import { providerByNpi, searchProviders, type Provider } from "./sources/nppes";
import { aggregatePrescribers, prescribersOf, type PrescriberExperience, type RawPrescriberRow } from "./sources/prescribers";
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
  "Pain Management",
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
  specialty?: string;
}

export function cleanFilters(sp: Record<string, string | string[] | undefined>): SpecialistFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();
  const state = one(sp.state)?.toUpperCase();
  const specialty = one(sp.specialty);
  return {
    state: state && US_STATES.includes(state) ? state : undefined,
    city: one(sp.city)?.replace(/[^\p{L} .'-]/gu, "").slice(0, 60) || undefined,
    specialty: specialty && SPECIALTIES.includes(specialty) ? specialty : undefined,
  };
}

export interface Specialist {
  provider: Provider | null;
  experience?: PrescriberExperience;
}

export interface SpecialistBundle {
  drug: string;
  filters: SpecialistFilters;
  mode: "prescribers" | "directory" | "needs-state";
  specialists: Specialist[];
  totalPrescribers: number;
  dataYear?: number;
  problems: SourceProblem[];
}

const MAX_SHOWN = 25;

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function getSpecialists(name: string, filters: SpecialistFilters): Promise<SpecialistBundle> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();
  if (!filters.state) {
    return { drug, filters, mode: "needs-state", specialists: [], totalPrescribers: 0, problems };
  }
  const state = filters.state;

  const { partD, meta } = await loadCostFiles();
  const apiUrl = meta.prescribers?.apiUrl;
  // CMS writes generic names its own way ("Metformin HCl"); take them from the imported Part D data.
  const genericNames = [...new Set(partD.rows.filter((r) => baseDrugName(r.generic) === drug).map((r) => r.generic))].slice(0, 3);

  if (apiUrl?.startsWith("https://data.cms.gov/") && genericNames.length > 0) {
    const rows = (
      await Promise.all(
        genericNames.map((g) =>
          attempt("CMS Part D Prescribers", problems, [] as RawPrescriberRow[], () => prescribersOf(apiUrl, g, { ...filters, state })),
        ),
      )
    ).flat();
    const prescribers = aggregatePrescribers(rows);
    const top = prescribers.slice(0, MAX_SHOWN);
    const providers = await inBatches(top, 5, (p) => attempt("NPI Registry", problems, null, () => providerByNpi(p.npi)));
    return {
      drug,
      filters,
      mode: "prescribers",
      specialists: top.map((experience, i) => ({ experience, provider: providers[i] })),
      totalPrescribers: prescribers.length,
      dataYear: meta.prescribers?.year,
      problems,
    };
  }

  // No prescribing data for this drug (or not imported yet): verified clinicians by specialty and location.
  const providers = await attempt("NPI Registry", problems, [] as Provider[], () =>
    searchProviders({ specialty: filters.specialty, state, city: filters.city }),
  );
  return {
    drug,
    filters,
    mode: "directory",
    specialists: providers.slice(0, MAX_SHOWN).map((provider) => ({ provider })),
    totalPrescribers: 0,
    problems,
  };
}
