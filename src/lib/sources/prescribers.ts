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
