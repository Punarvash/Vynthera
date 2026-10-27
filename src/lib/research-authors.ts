import type { Authorship } from "./sources/pubmed";
import { stateIn } from "./sources/trial-sites";

// Clinicians who published recent US studies of a drug: experience outside Medicare, from PubMed.

export interface ResearchAuthor {
  /** "Jane Q Doe" as PubMed lists it. */
  name: string;
  last: string;
  fore: string;
  affiliation: string;
  state?: string;
  papers: { pmid: string; year: string; title: string }[];
  /** Times listed as first or senior (last) author. */
  leadRoles: number;
  /** Year of the affiliation kept (the most recent paper's). */
  affiliationYear: string;
}

const US = /\b(USA|U\.S\.A\.|United States)\b/;

/** Group first and senior authorships by person (last name + first name), most papers first; US affiliations only. */
export function groupAuthors(rows: Authorship[], state?: string): ResearchAuthor[] {
  const byPerson = new Map<string, ResearchAuthor>();
  for (const r of rows) {
    if (!r.last || !r.fore || r.fore.length < 2 || !r.affiliation) continue;
    const st = stateIn(r.affiliation);
    if (!US.test(r.affiliation) && !st) continue;
    if (state && st !== state) continue;
    const key = `${r.last.toLowerCase()}|${r.fore.toLowerCase().split(/\s+/)[0]}`;
    const a = byPerson.get(key) ?? { name: `${r.fore} ${r.last}`, last: r.last, fore: r.fore, affiliation: r.affiliation, affiliationYear: r.year, state: st, papers: [], leadRoles: 0 };
    if (!a.papers.some((p) => p.pmid === r.pmid)) a.papers.push({ pmid: r.pmid, year: r.year, title: r.title });
    a.leadRoles += 1;
    // Keep the most recent affiliation.
    if (r.year > a.affiliationYear) {
      a.affiliation = r.affiliation;
      a.affiliationYear = r.year;
      a.state = st ?? a.state;
    }
    byPerson.set(key, a);
  }
  return [...byPerson.values()].sort((a, b) => b.papers.length - a.papers.length || b.leadRoles - a.leadRoles);
}

/** "Department of Endocrinology, Baylor College of Medicine, Houston, TX 77030, USA." -> "Baylor College of Medicine, Houston, TX". */
export function shortAffiliation(affiliation: string): string {
  const parts = affiliation
    .replace(/\s*Electronic address:.*$/i, "")
    .replace(/[.;]\s*$/, "")
    .split(/,\s*/)
    .filter((p) => !/^(USA|United States|U\.S\.A\.)$/i.test(p))
    .map((p) => p.replace(/\s+\d{5}(-\d{4})?$/, ""));
  const institution = parts.findIndex((p) => /universit|college|hospital|medical center|clinic|institute|health|school of medicine|center/i.test(p));
  const kept = institution >= 0 ? parts.slice(institution) : parts.slice(-3);
  return kept.slice(0, 3).join(", ");
}
