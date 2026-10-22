// Client-safe helpers (no server imports) for citing studies in letters and copied lists.

export interface CitationInput {
  authors: string;
  title: string;
  journal: string;
  year: string;
  pmid?: string;
  doi?: string;
  url: string;
  peerReviewed: boolean;
}

/** AMA-style reference, as used in most US medical necessity letters. */
export function formatCitation(c: CitationInput): string {
  const title = c.title.replace(/\.$/, "");
  const parts = [
    c.authors ? `${c.authors}.` : "",
    `${title}.`,
    c.journal ? `${c.journal}.` : "",
    c.year ? `${c.year}.` : "",
    c.pmid ? `PMID: ${c.pmid}.` : "",
    c.doi ? `doi:${c.doi}` : !c.pmid ? c.url : "",
    c.peerReviewed ? "" : "[Preprint, not peer reviewed]",
  ];
  return parts.filter(Boolean).join(" ");
}
