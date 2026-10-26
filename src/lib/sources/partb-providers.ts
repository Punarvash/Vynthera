import { cacheLife } from "next/cache";
import { getJson } from "../http";
import { cmsFilter } from "./prescribers";

// CMS "Medicare Physician & Other Practitioners - by Provider and Service": who billed Medicare Part B for
// a service, including clinic-administered drugs by HCPCS code (e.g. J1745 infliximab).
const SOURCE = "CMS Physician & Other Practitioners";

export interface RawServiceRow {
  Rndrng_NPI?: string;
  Rndrng_Prvdr_Last_Org_Name?: string;
  Rndrng_Prvdr_First_Name?: string;
  Rndrng_Prvdr_Crdntls?: string;
  Rndrng_Prvdr_Ent_Cd?: string;
  Rndrng_Prvdr_City?: string;
  Rndrng_Prvdr_State_Abrvtn?: string;
  Rndrng_Prvdr_Type?: string;
  HCPCS_Cd?: string;
  HCPCS_Desc?: string;
  Tot_Benes?: string;
  Tot_Srvcs?: string;
}

export interface Administrator {
  npi: string;
  name: string;
  city: string;
  state: string;
  type: string;
  patients: number;
  services: number;
  codes: string[];
}

/** One record per clinician (individuals only), most Medicare patients first. */
export function aggregateAdministrators(rows: RawServiceRow[]): Administrator[] {
  const byNpi = new Map<string, Administrator>();
  for (const r of rows) {
    const npi = r.Rndrng_NPI?.trim();
    if (!npi || r.Rndrng_Prvdr_Ent_Cd === "O") continue;
    const a = byNpi.get(npi) ?? {
      npi,
      name: [r.Rndrng_Prvdr_First_Name, r.Rndrng_Prvdr_Last_Org_Name].filter(Boolean).join(" "),
      city: r.Rndrng_Prvdr_City ?? "",
      state: r.Rndrng_Prvdr_State_Abrvtn ?? "",
      type: r.Rndrng_Prvdr_Type ?? "",
      patients: 0,
      services: 0,
      codes: [],
    };
    a.patients += Number(r.Tot_Benes) || 0;
    a.services += Number(r.Tot_Srvcs) || 0;
    if (r.HCPCS_Cd && !a.codes.includes(r.HCPCS_Cd)) a.codes.push(r.HCPCS_Cd);
    byNpi.set(npi, a);
  }
  return [...byNpi.values()].sort((a, b) => b.patients - a.patients);
}

export async function topAdministrators(
  apiUrl: string,
  params: { hcpcs: string[]; state?: string; city?: string; types?: string[] },
  size = 100,
): Promise<RawServiceRow[]> {
  "use cache";
  cacheLife("weeks");
  const q = new URLSearchParams({ size: String(size), sort: "-Tot_Benes" });
  cmsFilter(q, "HCPCS_Cd", params.hcpcs);
  if (params.state) q.set("filter[Rndrng_Prvdr_State_Abrvtn]", params.state);
  // Part B writes cities in title case ("Providence").
  if (params.city) q.set("filter[Rndrng_Prvdr_City]", params.city.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()));
  cmsFilter(q, "Rndrng_Prvdr_Type", params.types ?? []);
  return getJson<RawServiceRow[]>(SOURCE, `${apiUrl}?${q}`, { timeoutMs: 30000 });
}
