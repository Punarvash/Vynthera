import { cacheLife } from "next/cache";
import { getJson } from "../http";

// NLM Clinical Tables conditions list: consumer name, clinical name and synonyms for ~2,400 conditions,
// e.g. "High cholesterol" = "Hypercholesterolemia" = "Hyperlipidemia". https://clinicaltables.nlm.nih.gov/
const SOURCE = "NLM Clinical Tables";

type Response = [number, string[], { synonyms?: string[][]; primary_name?: string[] } | null, string[][]];

/** Pick the condition record matching the query: an exact consumer or clinical name, else the first hit. */
export function namesFromResponse(query: string, data: Response): string[] {
  const q = query.trim().toLowerCase();
  const rows = (data[3] ?? []).map((r, i) => ({
    consumer: r[0] ?? "",
    primary: data[2]?.primary_name?.[i] ?? "",
    synonyms: data[2]?.synonyms?.[i] ?? [],
  }));
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  // Without an exact name match, the first hit counts only if its name has every word typed ("ear infection" -> "Ear infection - middle").
  const close = (r: (typeof rows)[number]) => words.length > 0 && words.every((w) => `${r.consumer} ${r.primary}`.toLowerCase().includes(w));
  const pick = rows.find((r) => r.consumer.toLowerCase() === q || r.primary.toLowerCase() === q) ?? rows.find(close);
  if (!pick) return [];
  return [...new Set([pick.consumer, pick.primary, ...pick.synonyms].map((n) => n.trim().toLowerCase()).filter((n) => n.length > 2 && n !== q))];
}

export async function conditionNames(condition: string): Promise<string[]> {
  "use cache";
  cacheLife("weeks");
  const url = `https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(condition)}&df=consumer_name&ef=primary_name,synonyms&maxList=5`;
  return namesFromResponse(condition, await getJson<Response>(SOURCE, url, { quiet: true }));
}
