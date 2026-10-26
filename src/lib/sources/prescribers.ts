import { cacheLife } from "next/cache";
import { getJson } from "../http";

// CMS "Medicare Part D Prescribers - by Provider and Drug" via the data.cms.gov data API.
// The endpoint for the newest year is discovered by the weekly import and stored in data/costs/meta.json.
const SOURCE = "CMS Part D Prescribers";

export interface RawPrescriberRow {
  Prscrbr_NPI?: string;
  Prscrbr_Last_Org_Name?: string;
  Prscrbr_First_Name?: string;
  Prscrbr_City?: string;
  Prscrbr_State_Abrvtn?: string;
  Prscrbr_Type?: string;
  Brnd_Name?: string;
  Gnrc_Name?: string;
  Tot_Clms?: string;
  Tot_Benes?: string;
}

export interface PrescriberExperience {
  npi: string;
  name: string;
  city: string;
  state: string;
  type: string;
  claims: number;
  /** Medicare patients; undefined when CMS suppresses counts under 11. */
  patients?: number;
  brands: string[];
}

/** Combine rows (one per NPI and brand) into one record per prescriber, most claims first. */
export function aggregatePrescribers(rows: RawPrescriberRow[]): PrescriberExperience[] {
  const byNpi = new Map<string, PrescriberExperience>();
  for (const r of rows) {
    const npi = r.Prscrbr_NPI?.trim();
    if (!npi) continue;
    const claims = Number(r.Tot_Clms) || 0;
    const patients = r.Tot_Benes ? Number(r.Tot_Benes) : NaN;
    const p = byNpi.get(npi) ?? {
      npi,
      name: [r.Prscrbr_First_Name, r.Prscrbr_Last_Org_Name].filter(Boolean).join(" "),
      city: r.Prscrbr_City ?? "",
      state: r.Prscrbr_State_Abrvtn ?? "",
      type: r.Prscrbr_Type ?? "",
      claims: 0,
      brands: [],
    };
    p.claims += claims;
    if (Number.isFinite(patients)) p.patients = Math.max(p.patients ?? 0, patients);
    if (r.Brnd_Name && !p.brands.includes(r.Brnd_Name)) p.brands.push(r.Brnd_Name);
    byNpi.set(npi, p);
  }
  return [...byNpi.values()].sort((a, b) => b.claims - a.claims);
}

/** data.cms.gov data API filter: one value as a plain filter, several as an IN condition group. */
export function cmsFilter(q: URLSearchParams, field: string, values: string[]): void {
  const v = values.filter(Boolean);
  if (v.length === 0) return;
  if (v.length === 1) {
    q.set(`filter[${field}]`, v[0]);
    return;
  }
  q.set(`filter[${field}][condition][path]`, field);
  q.set(`filter[${field}][condition][operator]`, "IN");
  v.forEach((x, i) => q.set(`filter[${field}][condition][value][${i + 1}]`, x));
}

/**
 * Prescribers with the most Medicare Part D claims for any of the given drugs, optionally limited to a
 * place and to prescriber types (CMS specialty names). Sorted by CMS, so the first rows are the most experienced.
 */
export async function topPrescribers(
  apiUrl: string,
  params: { generics: string[]; state?: string; city?: string; types?: string[] },
  size = 100,
): Promise<RawPrescriberRow[]> {
  // Shared across server instances: data.cms.gov rate-limits bursts and these sorted queries take seconds.
  "use cache: remote";
  cacheLife("weeks");
  const q = new URLSearchParams({ size: String(size), sort: "-Tot_Clms" });
  cmsFilter(q, "Gnrc_Name", params.generics);
  if (params.state) q.set("filter[Prscrbr_State_Abrvtn]", params.state);
  if (params.city) q.set("filter[Prscrbr_City]", params.city.toUpperCase());
  cmsFilter(q, "Prscrbr_Type", params.types ?? []);
  return getJson<RawPrescriberRow[]>(SOURCE, `${apiUrl}?${q}`, { timeoutMs: 45000 });
}

export async function prescribersOf(
  apiUrl: string,
  genericName: string,
  filters: { state: string; city?: string; specialty?: string },
): Promise<RawPrescriberRow[]> {
  "use cache";
  cacheLife("weeks");
  const q = new URLSearchParams({ "filter[Gnrc_Name]": genericName, "filter[Prscrbr_State_Abrvtn]": filters.state, size: "1000" });
  if (filters.city) q.set("filter[Prscrbr_City]", filters.city.toUpperCase());
  if (filters.specialty) q.set("filter[Prscrbr_Type]", filters.specialty);
  return getJson<RawPrescriberRow[]>(SOURCE, `${apiUrl}?${q}`);
}
