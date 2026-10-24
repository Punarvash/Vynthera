import { cacheLife } from "next/cache";
import { XMLParser } from "fast-xml-parser";
import { getJson, getText } from "../http";
import { asArray, stripTags, truncate } from "../text";
import { pickDesign } from "../design";
import { extractBlinding, extractSampleSize, isCochrane } from "../study-features";
import type { Article } from "../types";

// NCBI E-utilities: https://www.ncbi.nlm.nih.gov/books/NBK25499/
const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const SOURCE = "PubMed";

function commonParams(): string {
  const key = process.env.NCBI_API_KEY ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}` : "";
  return `&tool=vynthera${key}`;
}

/** Publication-type filters for each tab. `medline[sb]` keeps results to MEDLINE-indexed journals. */
export const EVIDENCE_TYPES =
  '("meta-analysis"[pt] OR "systematic review"[pt] OR "randomized controlled trial"[pt] OR "clinical trial"[pt] OR "observational study"[pt])';
export const CASE_TYPES = '("case reports"[pt])';

/** PubMed's Clinical Queries therapy filter, plus reviews and observational studies it does not cover. */
export const THERAPY_FILTER = '(Therapy/Broad[filter] OR "meta-analysis"[pt] OR "systematic review"[pt] OR "observational study"[pt])';

const NOT_RETRACTED = 'NOT ("retracted publication"[pt] OR "retraction of publication"[pt])';

/** Design filters for full counts, so certainty reflects all of PubMed, not one page of results. */
export const COUNT_FILTERS = {
  metaAnalyses: '("meta-analysis"[pt] OR "systematic review"[pt])',
  rcts: '"randomized controlled trial"[pt]',
  nonRandomized: '("clinical trial"[pt] NOT "randomized controlled trial"[pt])',
  observational: '"observational study"[pt]',
  caseReports: '"case reports"[pt]',
} as const;

function quoted(s: string): string {
  return `"${s.replace(/["\[\]]/g, "")}"`;
}

/** Unquoted words let PubMed map the condition to its MeSH heading and synonyms (Automatic Term Mapping). */
function mappable(s: string): string {
  return s.replace(/["\[\]()]/g, " ").replace(/\b(AND|OR|NOT)\b/g, (w) => w.toLowerCase()).trim();
}

export function conditionClause(condition: string): string {
  return `(${quoted(condition)}[tiab] OR (${mappable(condition)}))`;
}

/** Drug named anywhere in title/abstract or indexed under its MeSH heading. */
export function drugClause(drugTerms: string[]): string {
  return `(${drugTerms.map((t) => `${quoted(t)}[tiab] OR ${quoted(t)}[mh]`).join(" OR ")})`;
}

/** Drug as a main subject: in the title or a MeSH major topic. */
export function mainTopicClause(drugTerms: string[]): string {
  return `(${drugTerms.map((t) => `${quoted(t)}[ti] OR ${quoted(t)}[majr]`).join(" OR ")})`;
}

export function buildQuery(
  drugTerms: string[],
  condition: string | undefined,
  typeFilter: string,
  options: { mainTopic?: boolean; therapy?: boolean } = {},
): string {
  const drug = options.mainTopic ? mainTopicClause(drugTerms) : drugClause(drugTerms);
  const cond = condition ? ` AND ${conditionClause(condition)}` : "";
  const therapy = options.therapy ? ` AND ${THERAPY_FILTER}` : "";
  return `${drug}${cond} AND ${typeFilter}${therapy} AND medline[sb] ${NOT_RETRACTED}`;
}

interface ESearchResponse {
  esearchresult?: { count?: string; idlist?: string[]; translationset?: { from?: string; to?: string }[] };
}

/** MeSH headings PubMed mapped the query's words to, e.g. "T2DM" -> "diabetes mellitus, type 2". */
export function meshFromTranslation(set: { from?: string; to?: string }[] | undefined): string[] {
  const terms = (set ?? []).flatMap((t) => [...(t.to ?? "").matchAll(/"([^"]+)"\[MeSH Terms\]/gi)].map((m) => m[1].toLowerCase()));
  return [...new Set(terms)];
}

export async function searchPubMed(
  term: string,
  retmax: number,
  retstart = 0,
): Promise<{ total: number; ids: string[]; meshTerms: string[] }> {
  "use cache";
  cacheLife("days");
  const url = `${BASE}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${retmax}&retstart=${retstart}&term=${encodeURIComponent(term)}${commonParams()}`;
  const data = await getJson<ESearchResponse>(SOURCE, url);
  return {
    total: Number(data.esearchresult?.count ?? 0),
    ids: data.esearchresult?.idlist ?? [],
    meshTerms: meshFromTranslation(data.esearchresult?.translationset),
  };
}

export async function fetchPubMed(ids: string[]): Promise<Article[]> {
  "use cache";
  cacheLife("days");
  if (ids.length === 0) return [];
  const url = `${BASE}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}${commonParams()}`;
  const xml = await getText(SOURCE, url);
  // Retracted papers are excluded by the query; drop any that slip through.
  const byId = new Map<string | undefined, Article>(parsePubMedXml(xml).filter((a) => !a.retracted).map((a) => [a.pmid, a]));
  // Keep relevance order from esearch.
  return ids.map((id) => byId.get(id)).filter((a): a is Article => a !== undefined);
}

const ARRAY_TAGS = new Set([
  "PubmedArticle",
  "AbstractText",
  "PublicationType",
  "Grant",
  "DataBank",
  "AccessionNumber",
  "Author",
  "AffiliationInfo",
  "ArticleId",
  "MeshHeading",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  // Titles and abstracts contain inline markup (<i>, <sup>); keep them as raw strings.
  stopNodes: ["*.ArticleTitle", "*.AbstractText"],
  isArray: (name) => ARRAY_TAGS.has(name),
});

/* eslint-disable @typescript-eslint/no-explicit-any -- PubMed XML is loosely shaped */
function textOf(node: any): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  return String(node["#text"] ?? "");
}

function yearOf(pubDate: any): string {
  if (!pubDate) return "";
  if (pubDate.Year) return textOf(pubDate.Year);
  const m = textOf(pubDate.MedlineDate).match(/\d{4}/);
  return m ? m[0] : "";
}

export type ParsedArticle = Article & { retracted: boolean };

export function parsePubMedXml(xml: string): ParsedArticle[] {
  const doc = parser.parse(xml);
  const articles = asArray<any>(doc?.PubmedArticleSet?.PubmedArticle);
  return articles.map((pa): ParsedArticle => {
    const mc = pa.MedlineCitation ?? {};
    const art = mc.Article ?? {};
    const pmid = textOf(mc.PMID);

    const abstractParts = asArray<any>(art.Abstract?.AbstractText).map((p) => ({
      label: typeof p === "object" ? String(p["@_Label"] ?? "") : "",
      text: stripTags(textOf(p)),
    }));
    const abstract = abstractParts.map((p) => (p.label ? `${p.label}: ${p.text}` : p.text)).join(" ");
    const conclusion = abstractParts.find((p) => /conclu|interpretation/i.test(p.label))?.text;

    const pubTypes = asArray<any>(art.PublicationTypeList?.PublicationType).map(textOf);
    const nctIds = asArray<any>(art.DataBankList?.DataBank)
      .filter((d) => /clinicaltrials/i.test(textOf(d.DataBankName)))
      .flatMap((d) => asArray<any>(d.AccessionNumberList?.AccessionNumber).map(textOf))
      .filter((id) => /^NCT\d{8}$/.test(id));
    const grantAgencies = [
      ...new Set(asArray<any>(art.GrantList?.Grant).map((g) => textOf(g.Agency)).filter(Boolean)),
    ];

    const authors = asArray<any>(art.AuthorList?.Author)
      .map((a) => (a.LastName ? `${textOf(a.LastName)} ${textOf(a.Initials)}`.trim() : textOf(a.CollectiveName)))
      .filter(Boolean);
    const articleIds = asArray<any>(pa.PubmedData?.ArticleIdList?.ArticleId);
    const doi = articleIds.find((id) => id["@_IdType"] === "doi");
    const pmc = articleIds.find((id) => id["@_IdType"] === "pmc");
    const headings = asArray<any>(mc.MeshHeadingList?.MeshHeading).map((h) => {
      const d = h.DescriptorName;
      const qualifiers = asArray<any>(h.QualifierName);
      const major = (d && typeof d === "object" && d["@_MajorTopicYN"] === "Y") || qualifiers.some((q) => q?.["@_MajorTopicYN"] === "Y");
      return { name: textOf(d).toLowerCase(), major };
    });
    const journal = textOf(art.Journal?.Title) || textOf(art.Journal?.ISOAbbreviation);
    const fullText = `${stripTags(textOf(art.ArticleTitle))} ${abstract}`;

    return {
      id: `pmid-${pmid}`,
      source: "pubmed",
      peerReviewed: true,
      title: stripTags(textOf(art.ArticleTitle)) || "(No title)",
      journal,
      year: yearOf(art.Journal?.JournalIssue?.PubDate),
      authors: authors.length > 3 ? `${authors.slice(0, 3).join(", ")}, et al.` : authors.join(", "),
      abstract: truncate(abstract, 4000),
      conclusion,
      design: pickDesign(pubTypes),
      designInferred: false,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      pmid,
      doi: doi ? textOf(doi) : undefined,
      nctIds: [...new Set(nctIds)],
      grantAgencies,
      // Filled in by classifyFunding once trial sponsors are known.
      funding: { kind: "unreported", reason: "" },
      meshMajor: headings.filter((h) => h.major).map((h) => h.name),
      mesh: headings.map((h) => h.name),
      pmcid: pmc ? textOf(pmc) : undefined,
      cochrane: isCochrane(journal),
      sampleSize: extractSampleSize(abstract),
      blinding: extractBlinding(fullText),
      // Set by the caller, which knows the drug's names.
      aboutDrug: false,
      retracted: pubTypes.some((t) => /^retracted publication$/i.test(t)),
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface MeshSummary {
  result?: Record<string, { ds_meshterms?: string[] } | string[]>;
}

/** "Diabetes Mellitus, Type 2" -> "type 2 diabetes mellitus". */
export function uninvert(term: string): string {
  const parts = term.split(", ");
  return (parts.length === 2 ? `${parts[1]} ${parts[0]}` : term).toLowerCase();
}

/** The condition's MeSH heading and entry terms, e.g. "T2DM", "NIDDM", "Type 2 Diabetes". */
export async function meshSynonyms(condition: string): Promise<string[]> {
  "use cache";
  cacheLife("weeks");
  const search = await getJson<ESearchResponse>(
    SOURCE,
    // Untagged, so abbreviations like "T2DM" still find their heading.
    `${BASE}/esearch.fcgi?db=mesh&retmode=json&retmax=1&term=${encodeURIComponent(mappable(condition))}${commonParams()}`,
  );
  const uid = search.esearchresult?.idlist?.[0];
  if (!uid) return [];
  const summary = await getJson<MeshSummary>(SOURCE, `${BASE}/esummary.fcgi?db=mesh&retmode=json&id=${uid}${commonParams()}`);
  const entry = summary.result?.[uid];
  const terms = entry && !Array.isArray(entry) ? (entry.ds_meshterms ?? []) : [];
  return [...new Set(terms.flatMap((t) => [t.toLowerCase(), uninvert(t)]))].slice(0, 40);
}
