import { cacheLife } from "next/cache";
import { getJson } from "../http";
import { asArray, stripTags, truncate } from "../text";
import { inferDesignFromText } from "../design";
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
