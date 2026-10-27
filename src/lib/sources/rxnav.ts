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

/**
 * Brand names from branded product names ("metformin hydrochloride 500 MG Oral Tablet [Glucophage]"). For a single
 * ingredient, products that combine it with others ("... / sitagliptin ... [Janumet]") are skipped.
 */
export function brandsFromProducts(names: string[], combination: boolean): string[] {
  const out = new Set<string>();
  for (const n of names) {
    if (!combination && n.includes(" / ")) continue;
    const b = n.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim();
    if (b) out.add(b);
  }
  return [...out].sort();
}

export interface Ingredient {
  rxcui: string;
  /** RxNorm ingredient name, e.g. "metformin"; for combinations "metformin / sitagliptin". */
  name: string;
  combination: boolean;
  /** Brand names of products with exactly this ingredient (or combination). */
  brands: string[];
  /** Salt and precise forms, e.g. "metformin hydrochloride". */
  preciseNames: string[];
}

interface Properties {
  properties?: { rxcui?: string; name?: string; tty?: string };
}

function conceptsOf(r: Related, tty: string): { rxcui: string; name?: string }[] {
  return (r.relatedGroup?.conceptGroup ?? []).filter((g) => g.tty === tty).flatMap((g) => g.conceptProperties ?? []);
}

/**
 * The RxNorm ingredient a name refers to: "Glucophage", "metformin hydrochloride" and "metformin ER 500 mg"
 * all resolve to the ingredient metformin. Null when RxNorm does not know the name.
 */
export async function ingredientFor(name: string): Promise<Ingredient | null> {
  "use cache";
  cacheLife("weeks");
  const q = name.trim();
  if (!q) return null;
  const found = await getJson<{ idGroup?: { rxnormId?: string[] } }>(SOURCE, `${BASE}/rxcui.json?name=${encodeURIComponent(q)}&search=2`, { notFoundAs: {} });
  const id = found.idGroup?.rxnormId?.[0];
  if (!id) return null;
  const props = await getJson<Properties>(SOURCE, `${BASE}/rxcui/${id}/properties.json`, { notFoundAs: {} });
  const tty = props.properties?.tty ?? "";
  let ing: { rxcui: string; name?: string } | undefined;
  let combination = false;
  if (tty === "IN" || tty === "MIN") {
    ing = { rxcui: id, name: props.properties?.name };
    combination = tty === "MIN";
  } else {
    const up = await getJson<Related>(SOURCE, `${BASE}/rxcui/${id}/related.json?tty=IN+MIN`, { notFoundAs: {} });
    const ins = conceptsOf(up, "IN");
    const mins = conceptsOf(up, "MIN");
    // A brand of a combination product relates to every ingredient and to the combination; prefer the combination.
    if (ins.length === 1 && mins.length === 0) ing = ins[0];
    else if (mins.length === 1) {
      ing = mins[0];
      combination = true;
    } else if (ins.length === 1) ing = ins[0];
  }
  if (!ing?.name) return null;
  const down = await getJson<Related>(SOURCE, `${BASE}/rxcui/${ing.rxcui}/related.json?tty=SBD+PIN`, { notFoundAs: {} });
  return {
    rxcui: ing.rxcui,
    name: ing.name.toLowerCase(),
    combination,
    brands: brandsFromProducts(conceptsOf(down, "SBD").map((c) => c.name ?? ""), combination).slice(0, 12),
    preciseNames: [...new Set(conceptsOf(down, "PIN").map((c) => (c.name ?? "").toLowerCase()).filter(Boolean))].slice(0, 6),
  };
}
