import { cacheLife } from "next/cache";
import { XMLParser } from "fast-xml-parser";
import { getJson, getText } from "../http";
import { asArray, stripTags, truncate } from "../text";
import { pickDesign } from "../design";
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

export function buildQuery(drugTerms: string[], condition: string | undefined, typeFilter: string): string {
  const drug = `(${drugTerms.map((t) => `"${t.replace(/"/g, "")}"[tiab]`).join(" OR ")})`;
  const cond = condition ? ` AND ("${condition.replace(/"/g, "")}"[tiab] OR "${condition.replace(/"/g, "")}"[mh])` : "";
  return `${drug}${cond} AND ${typeFilter} AND medline[sb]`;
}

interface ESearchResponse {
  esearchresult?: { count?: string; idlist?: string[] };
}

export async function searchPubMed(term: string, retmax: number): Promise<{ total: number; ids: string[] }> {
  "use cache";
  cacheLife("days");
  const url = `${BASE}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${retmax}&term=${encodeURIComponent(term)}${commonParams()}`;
  const data = await getJson<ESearchResponse>(SOURCE, url);
  return {
    total: Number(data.esearchresult?.count ?? 0),
    ids: data.esearchresult?.idlist ?? [],
  };
}

export async function fetchPubMed(ids: string[]): Promise<Article[]> {
  "use cache";
  cacheLife("days");
  if (ids.length === 0) return [];
  const url = `${BASE}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}${commonParams()}`;
  const xml = await getText(SOURCE, url);
  const byId = new Map(parsePubMedXml(xml).map((a) => [a.pmid, a]));
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

export function parsePubMedXml(xml: string): Article[] {
  const doc = parser.parse(xml);
  const articles = asArray<any>(doc?.PubmedArticleSet?.PubmedArticle);
  return articles.map((pa): Article => {
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
    const doi = asArray<any>(pa.PubmedData?.ArticleIdList?.ArticleId).find((id) => id["@_IdType"] === "doi");

    return {
      id: `pmid-${pmid}`,
      source: "pubmed",
      peerReviewed: true,
      title: stripTags(textOf(art.ArticleTitle)) || "(No title)",
      journal: textOf(art.Journal?.Title) || textOf(art.Journal?.ISOAbbreviation),
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
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
