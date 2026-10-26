import { cacheLife } from "next/cache";
import { getJson } from "../http";

// RxNorm API (National Library of Medicine), free and keyless: https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html
const BASE = "https://rxnav.nlm.nih.gov/REST";
const SOURCE = "RxNorm";

interface Related {
  relatedGroup?: { conceptGroup?: { tty?: string; conceptProperties?: { rxcui: string; name?: string }[] }[] };
}

/**
 * Every prescribable product RxCUI (clinical and branded drugs and packs) for an ingredient, e.g. all
 * strengths and forms of metformin, without combination products. Plan formularies list drugs by these RxCUIs.
 */
export async function productRxcuis(ingredient: string): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const found = await getJson<{ idGroup?: { rxnormId?: string[] } }>(SOURCE, `${BASE}/rxcui.json?name=${encodeURIComponent(ingredient)}&search=2`, { notFoundAs: {} });
  const id = found.idGroup?.rxnormId?.[0];
  if (!id) return [];
  const related = await getJson<Related>(SOURCE, `${BASE}/rxcui/${id}/related.json?tty=SCD+SBD+GPCK+BPCK`);
  // Combination products ("metformin / sitagliptin") belong to other drugs; their names join ingredients with " / ".
  const products = (related.relatedGroup?.conceptGroup ?? []).flatMap((g) => g.conceptProperties ?? []);
  return [...new Set(products.filter((c) => !c.name?.includes(" / ")).map((c) => c.rxcui))];
}
