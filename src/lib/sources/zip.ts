import { cacheLife } from "next/cache";
import { getJson } from "../http";

// Zippopotam.us: free ZIP code lookup (place name and state), no key.
export async function placeForZip(zip: string): Promise<{ city: string; state: string } | null> {
  "use cache";
  cacheLife("weeks");
  if (!/^\d{5}$/.test(zip)) return null;
  const data = await getJson<{ places?: { "place name"?: string; "state abbreviation"?: string }[] }>("ZIP lookup", `https://api.zippopotam.us/us/${zip}`, {
    notFoundAs: {},
    timeoutMs: 5000,
  });
  const p = data.places?.[0];
  return p?.["state abbreviation"] ? { city: p["place name"] ?? "", state: p["state abbreviation"] } : null;
}
