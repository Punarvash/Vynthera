import { cacheLife } from "next/cache";
import { getJson } from "../http";
import { titleCase } from "../text";

// NPPES NPI Registry API: https://npiregistry.cms.hhs.gov/api-page
const BASE = "https://npiregistry.cms.hhs.gov/api/";
const SOURCE = "NPI Registry";

interface RawResult {
  number?: string | number;
  enumeration_type?: string;
  basic?: { first_name?: string; last_name?: string; credential?: string; organization_name?: string; status?: string };
  addresses?: {
    address_purpose?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    telephone_number?: string;
  }[];
  taxonomies?: { desc?: string; primary?: boolean }[];
}

export interface Provider {
  npi: string;
  name: string;
  credential?: string;
  specialty: string;
  otherSpecialties: string[];
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  registryUrl: string;
}

function formatZip(z?: string): string {
  if (z && z.length === 9) return z.endsWith("0000") ? z.slice(0, 5) : `${z.slice(0, 5)}-${z.slice(5)}`;
  return z ?? "";
}

export function toProvider(r: RawResult): Provider | null {
  const npi = r.number ? String(r.number) : "";
  if (!/^\d{10}$/.test(npi)) return null;
  const b = r.basic ?? {};
  const loc = r.addresses?.find((a) => a.address_purpose === "LOCATION") ?? r.addresses?.[0];
  const primary = r.taxonomies?.find((t) => t.primary) ?? r.taxonomies?.[0];
  const name = b.organization_name ?? [b.first_name, b.last_name].filter(Boolean).join(" ");
  return {
    npi,
    name: titleCase(name),
    credential: b.credential?.replace(/\./g, "").trim() || undefined,
    specialty: primary?.desc ?? "Not listed",
    otherSpecialties: (r.taxonomies ?? []).filter((t) => t !== primary && t.desc).map((t) => t.desc as string),
    address: loc ? [loc.address_1, loc.address_2].filter(Boolean).map((s) => titleCase(s as string)).join(", ") : undefined,
    city: loc?.city ? `${titleCase(loc.city)}, ${loc.state ?? ""} ${formatZip(loc.postal_code)}`.trim() : undefined,
    state: loc?.state,
    phone: loc?.telephone_number,
    registryUrl: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
  };
}

export async function providerByNpi(npi: string): Promise<Provider | null> {
  "use cache";
  cacheLife("weeks");
  const data = await getJson<{ results?: RawResult[] }>(SOURCE, `${BASE}?version=2.1&number=${encodeURIComponent(npi)}`);
  return data.results?.[0] ? toProvider(data.results[0]) : null;
}

/** Individual clinicians (NPI-1) by specialty and location, when no prescribing data is available. */
export async function searchProviders(params: { specialty?: string; state: string; city?: string }): Promise<Provider[]> {
  "use cache";
  cacheLife("days");
  const q = new URLSearchParams({ version: "2.1", enumeration_type: "NPI-1", state: params.state, limit: "50" });
  if (params.specialty) q.set("taxonomy_description", params.specialty);
  if (params.city) q.set("city", params.city);
  const data = await getJson<{ results?: RawResult[] }>(SOURCE, `${BASE}?${q}`);
  return (data.results ?? []).map(toProvider).filter((p): p is Provider => p !== null);
}
