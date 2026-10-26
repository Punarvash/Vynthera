import { cacheLife } from "next/cache";
import { getJson } from "../http";
import { stripTags, truncate } from "../text";

// MedlinePlus Connect (NLM): https://medlineplus.gov/medlineplus-connect/web-service/
// Plain-language drug information for patients, looked up by RxNorm concept ID.
const BASE = "https://connect.medlineplus.gov/service";
const SOURCE = "MedlinePlus";
const RXNORM_OID = "2.16.840.1.113883.6.88";

export interface MedlinePlusEntry {
  title: string;
  url: string;
  summary: string;
}

interface RawFeed {
  feed?: {
    entry?: {
      title?: { _value?: string };
      link?: { href?: string }[];
      summary?: { _value?: string };
    }[];
  };
}

export function parseMedlinePlus(data: RawFeed): MedlinePlusEntry[] {
  return (data.feed?.entry ?? [])
    .map((e) => ({
      title: stripTags(e.title?._value ?? ""),
      url: e.link?.[0]?.href ?? "",
      summary: truncate(stripTags(e.summary?._value ?? ""), 1200),
    }))
    .filter((e) => e.title && e.url.startsWith("https://"));
}

/** Try each RxNorm ID from the label until MedlinePlus has a page for one (English, or Spanish with "es"). */
export async function medlinePlusForRxcuis(rxcuis: string[], language: "en" | "es" = "en"): Promise<MedlinePlusEntry[]> {
  "use cache";
  cacheLife("weeks");
  for (const rxcui of rxcuis.slice(0, 4)) {
    const url =
      `${BASE}?mainSearchCriteria.v.cs=${RXNORM_OID}&mainSearchCriteria.v.c=${encodeURIComponent(rxcui)}` +
      `&knowledgeResponseType=application/json&informationRecipient.languageCode.c=${language}`;
    const entries = parseMedlinePlus(await getJson<RawFeed>(SOURCE, url));
    if (entries.length > 0) return entries;
  }
  return [];
}
