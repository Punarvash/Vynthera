import { cacheLife } from "next/cache";
import { abbreviationSynonyms } from "../condition-synonyms";
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

/** The condition and its expansions ("T2DM" -> "type 2 diabetes mellitus") as one OR group. */
function conditionTerm(condition: string, field = ""): string {
  const all = [condition, ...abbreviationSynonyms(condition)];
  return `(${all.map((c) => `${field}${term(c)}`).join(" OR ")})`;
}

export async function searchPreprints(drugTerms: string[], condition: string | undefined, pageSize = 10): Promise<Article[]> {
  "use cache";
  cacheLife("days");
  const drug = `(${drugTerms.map(term).join(" OR ")})`;
  const query = `${drug}${condition ? ` AND ${conditionTerm(condition)}` : ""} AND SRC:PPR`;
  const url = `${BASE}?format=json&resultType=core&pageSize=${pageSize}&query=${encodeURIComponent(query)}`;
  const data = await getJson<RawResponse>(SOURCE, url);
  return (data.resultList?.result ?? []).map(toPreprint).filter((a): a is Article => a !== null);
}

interface LiteResponse {
  hitCount?: number;
  resultList?: { result?: { pmid?: string; pubYear?: string; citedByCount?: number; isOpenAccess?: string; pmcid?: string }[] };
}

export interface LiteratureProfile {
  /** All matching PubMed records in Europe PMC. */
  total: number;
  /** Records counted in byYear (at most 500 of the most relevant). */
  sampled: number;
  byYear: Record<string, number>;
  /** Times cited, keyed by PMID. */
  citations: Record<string, number>;
  /** PMIDs whose full text is open access in Europe PMC (others have no reusable full text). */
  openAccess: string[];
}

/** Publications per year and citation counts for the drug (and condition), in one request. */
export async function literatureProfile(drugTerms: string[], condition: string | undefined): Promise<LiteratureProfile> {
  "use cache";
  cacheLife("days");
  const query = profileQuery(drugTerms, condition);
  const url = `${BASE}?format=json&resultType=lite&pageSize=500&query=${encodeURIComponent(query)}`;
  const data = await getJson<LiteResponse>(SOURCE, url, { timeoutMs: 15000 });
  const rows = data.resultList?.result ?? [];
  const byYear: Record<string, number> = {};
  const citations: Record<string, number> = {};
  const openAccess: string[] = [];
  for (const r of rows) {
    if (r.pmid && r.isOpenAccess === "Y" && r.pmcid) openAccess.push(r.pmid);
    if (r.pubYear) byYear[r.pubYear] = (byYear[r.pubYear] ?? 0) + 1;
    if (r.pmid && typeof r.citedByCount === "number") citations[r.pmid] = r.citedByCount;
  }
  const total = data.hitCount ?? rows.length;
  if (rows.length < total) {
    // The 500 rows are the most relevant, not a random sample, so count every year exactly instead.
    const exact = await countsByYear(query, Math.max(...Object.keys(byYear).map(Number).filter(Number.isFinite)));
    if (exact) return { total, sampled: total, byYear: exact, citations, openAccess };
  }
  return { total, sampled: rows.length, byYear, citations, openAccess };
}

function profileQuery(drugTerms: string[], condition: string | undefined): string {
  const drug = `(${drugTerms.map((t) => `TITLE_ABS:${term(t)}`).join(" OR ")})`;
  return `${drug}${condition ? ` AND ${conditionTerm(condition, "TITLE_ABS:")}` : ""} AND SRC:MED`;
}

/** Exact publication counts for each of the last 25 years; null if any year fails, so the chart never shows gaps as zeros. */
async function countsByYear(query: string, latestYear: number): Promise<Record<string, number> | null> {
  if (!Number.isFinite(latestYear)) return null;
  const years = Array.from({ length: 25 }, (_, i) => latestYear - 24 + i);
  try {
    const counts = await Promise.all(
      years.map(async (y) => {
        const url = `${BASE}?format=json&resultType=idlist&pageSize=1&query=${encodeURIComponent(`${query} AND PUB_YEAR:${y}`)}`;
        const data = await getJson<{ hitCount?: number }>(SOURCE, url, { timeoutMs: 8000, quiet: true });
        return [String(y), data.hitCount ?? 0] as const;
      }),
    );
    return Object.fromEntries(counts.filter(([, n]) => n > 0));
  } catch {
    return null;
  }
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
    return parseDisclosures(await getText(SOURCE, url, { quiet: true }));
  } catch {
    // Many PMC articles have no reusable full text; that is not an outage.
    return null;
  }
}
