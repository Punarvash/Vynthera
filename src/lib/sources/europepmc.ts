import { cacheLife } from "next/cache";
import { getJson, getText } from "../http";
import { asArray, stripTags, truncate } from "../text";
import { inferDesignFromText } from "../design";
import { extractBlinding, extractSampleSize } from "../study-features";
import type { Article } from "../types";

// Europe PMC REST API: https://europepmc.org/RestfulWebService
// Used here for preprints (SRC:PPR), which PubMed's MEDLINE subset does not include.
const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const SOURCE = "Europe PMC";

interface RawResult {
  id?: string;
  source?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  doi?: string;
  abstractText?: string;
  bookOrReportDetails?: { publisher?: string };
  grantsList?: { grant?: { agency?: string }[] };
}

interface RawResponse {
  hitCount?: number;
  resultList?: { result?: RawResult[] };
}

export function toPreprint(r: RawResult): Article | null {
  if (!r.id || !r.title) return null;
  const title = stripTags(r.title);
  const abstract = stripTags(r.abstractText ?? "");
  const authors = (r.authorString ?? "").replace(/\.$/, "");
  return {
    id: `ppr-${r.id}`,
    source: "preprint",
    peerReviewed: false,
    title,
    journal: r.bookOrReportDetails?.publisher ? `${r.bookOrReportDetails.publisher} (preprint)` : "Preprint",
    year: r.pubYear ?? "",
    authors: authors.split(", ").length > 3 ? `${authors.split(", ").slice(0, 3).join(", ")}, et al.` : authors,
    abstract: truncate(abstract, 4000),
    design: inferDesignFromText(`${title} ${abstract.slice(0, 600)}`),
    designInferred: true,
    url: `https://europepmc.org/article/PPR/${encodeURIComponent(r.id)}`,
    doi: r.doi,
    nctIds: [...new Set(abstract.match(/NCT\d{8}/g) ?? [])],
    grantAgencies: [...new Set(asArray(r.grantsList?.grant).map((g) => g.agency ?? "").filter(Boolean))],
    funding: { kind: "unreported", reason: "" },
    meshMajor: [],
    mesh: [],
    cochrane: false,
    sampleSize: extractSampleSize(abstract),
    blinding: extractBlinding(`${title} ${abstract}`),
    aboutDrug: false,
  };
}

function term(s: string): string {
  return `"${s.replace(/"/g, "")}"`;
}

export async function searchPreprints(drugTerms: string[], condition: string | undefined, pageSize = 10): Promise<Article[]> {
  "use cache";
  cacheLife("days");
  const drug = `(${drugTerms.map(term).join(" OR ")})`;
  const query = `${drug}${condition ? ` AND ${term(condition)}` : ""} AND SRC:PPR`;
  const url = `${BASE}?format=json&resultType=core&pageSize=${pageSize}&query=${encodeURIComponent(query)}`;
  const data = await getJson<RawResponse>(SOURCE, url);
  return (data.resultList?.result ?? []).map(toPreprint).filter((a): a is Article => a !== null);
}

interface LiteResponse {
  hitCount?: number;
  resultList?: { result?: { pmid?: string; pubYear?: string; citedByCount?: number }[] };
}

export interface LiteratureProfile {
  /** All matching PubMed records in Europe PMC. */
  total: number;
  /** Records counted in byYear (at most 1,000 of the most relevant). */
  sampled: number;
  byYear: Record<string, number>;
  /** Times cited, keyed by PMID. */
  citations: Record<string, number>;
}

/** Publications per year and citation counts for the drug (and condition), in one request. */
export async function literatureProfile(drugTerms: string[], condition: string | undefined): Promise<LiteratureProfile> {
  "use cache";
  cacheLife("days");
  const drug = `(${drugTerms.map((t) => `TITLE_ABS:${term(t)}`).join(" OR ")})`;
  const query = `${drug}${condition ? ` AND TITLE_ABS:${term(condition)}` : ""} AND SRC:MED`;
  const url = `${BASE}?format=json&resultType=lite&pageSize=1000&query=${encodeURIComponent(query)}`;
  const data = await getJson<LiteResponse>(SOURCE, url);
  const rows = data.resultList?.result ?? [];
  const byYear: Record<string, number> = {};
  const citations: Record<string, number> = {};
  for (const r of rows) {
    if (r.pubYear) byYear[r.pubYear] = (byYear[r.pubYear] ?? 0) + 1;
    if (r.pmid && typeof r.citedByCount === "number") citations[r.pmid] = r.citedByCount;
  }
  return { total: data.hitCount ?? rows.length, sampled: rows.length, byYear, citations };
}

export interface FullTextDisclosures {
  funding?: string;
  fundingSources: string[];
  coi?: string;
}

function sections(xml: string, pattern: RegExp): string[] {
  return [...xml.matchAll(pattern)].map((m) => stripTags(m[1])).filter(Boolean);
}

/** Funding and conflict-of-interest statements from an open-access article's full text (JATS XML). */
export function parseDisclosures(xml: string): FullTextDisclosures {
  const funding = [
    ...sections(xml, /<funding-statement[^>]*>([\s\S]*?)<\/funding-statement>/gi),
    ...sections(xml, /<sec[^>]*sec-type="funding"[^>]*>([\s\S]*?)<\/sec>/gi),
    ...sections(xml, /<fn[^>]*fn-type="(?:financial-disclosure|funding|supported-by)"[^>]*>([\s\S]*?)<\/fn>/gi),
  ];
  const fundingSources = [
    ...new Set(sections(xml, /<funding-source[^>]*>([\s\S]*?)<\/funding-source>/gi).map((s) => s.replace(/\s*https?:\/\/\S+/g, "").trim())),
  ].filter(Boolean);
  const coi = [
    ...sections(xml, /<fn[^>]*fn-type="(?:conflict|COI-statement|competing-interests)"[^>]*>([\s\S]*?)<\/fn>/gi),
    ...sections(xml, /<sec[^>]*sec-type="(?:COI-statement|conflict|competing-interests)"[^>]*>([\s\S]*?)<\/sec>/gi),
  ];
  return {
    funding: funding.length ? truncate(funding.join(" "), 700) : undefined,
    fundingSources: fundingSources.slice(0, 8),
    coi: coi.length ? truncate(coi.join(" "), 500) : undefined,
  };
}

export async function fullTextDisclosures(pmcid: string): Promise<FullTextDisclosures | null> {
  "use cache";
  cacheLife("weeks");
  if (!/^PMC\d+$/.test(pmcid)) return null;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`;
  try {
    return parseDisclosures(await getText(SOURCE, url));
  } catch {
    // Many PMC articles have no reusable full text; that is not an outage.
    return null;
  }
}
