import { attempt, drugTerms, withFunding } from "./evidence";
import { applicationsForDrug, type Application } from "./sources/drugsfda";
import { baseDrugName, getLabel } from "./sources/openfda";
import { fetchPubMed, mainTopicClause, searchPubMed } from "./sources/pubmed";
import { trialsBySponsor } from "./sources/clinicaltrials";
import { titleCase } from "./text";
import type { Article, DrugLabel, SourceProblem, Trial } from "./types";

const CORPORATE_WORDS = new Set([
  "inc", "incorporated", "a/s", "as", "llc", "ltd", "limited", "plc", "ag", "gmbh", "sa", "s.a", "spa", "bv", "nv", "kk", "co", "company",
  "corp", "corporation", "holdings", "group", "usa", "us", "america", "north", "international", "global", "the", "and",
  "pharmaceuticals", "pharmaceutical", "pharma", "pharms", "pharm", "labs", "laboratories", "laboratory", "industries",
  "products", "healthcare", "therapeutics", "sciences", "lifesciences", "biopharma",
]);

/** "Teva Pharmaceuticals USA, Inc." -> "Teva"; "BRISTOL MYERS SQUIBB" -> "Bristol Myers Squibb". */
export function companyCore(name: string): string {
  const words = name
    .replace(/[.,()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !CORPORATE_WORDS.has(w.toLowerCase()));
  return titleCase((kept.length ? kept : words).slice(0, 3).join(" "));
}

export function sameCompany(a: string, b: string): boolean {
  const x = companyCore(a).toLowerCase();
  const y = companyCore(b).toLowerCase();
  if (x === y) return true;
  // A shared first word is not enough on its own: "Sun Pharma" is not "Sun Yat-sen University".
  if (NOT_A_COMPANY.test(a) || NOT_A_COMPANY.test(b)) return false;
  return x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

const NOT_A_COMPANY = /\b(university|hospital|institute|college|foundation|center|centre|clinic|ministry|council|school|health system)\b/i;

const SUFFIX_CASE: Record<string, string> = { usa: "USA", llc: "LLC", inc: "Inc", ltd: "Ltd", plc: "PLC", ag: "AG", gmbh: "GmbH", lp: "LP", us: "US" };

/** "PLACEHOLDER GENERICS USA LLC" -> "Placeholder Generics USA LLC". */
export function displayCompany(name: string): string {
  return titleCase(name.replace(/\.$/, "")).replace(/\b([A-Za-z]+)\b/g, (w) => SUFFIX_CASE[w.toLowerCase()] ?? w);
}

export interface Company {
  name: string;
  core: string;
  applications: Application[];
  isInnovator: boolean;
  activeProducts: number;
}

/** Group applications by holder. Brand (NDA/BLA) holders first, then generics with marketed products. */
export function groupByCompany(apps: Application[]): Company[] {
  const byCore = new Map<string, Company>();
  for (const a of apps) {
    const core = companyCore(a.sponsor);
    const c = byCore.get(core) ?? { name: displayCompany(a.sponsor), core, applications: [], isInnovator: false, activeProducts: 0 };
    c.applications.push(a);
    c.isInnovator ||= a.type === "NDA" || a.type === "BLA";
    c.activeProducts += a.activeProducts;
    byCore.set(core, c);
  }
  const firstApproval = (c: Company) => c.applications.map((a) => a.approvedOn ?? "9999").sort()[0];
  return [...byCore.values()].sort(
    (a, b) =>
      Number(b.isInnovator) - Number(a.isInnovator) ||
      Number(b.activeProducts > 0) - Number(a.activeProducts > 0) ||
      firstApproval(a).localeCompare(firstApproval(b)),
  );
}

export interface ManufacturerBundle {
  drug: string;
  label: DrugLabel | null;
  companies: Company[];
  researchCompanies: string[];
  trials: Trial[];
  publications: Article[];
  problems: SourceProblem[];
}

export async function getManufacturerBundle(name: string): Promise<ManufacturerBundle> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();
  const ingredientNames = [...new Set([label?.genericName, drug].filter((n): n is string => Boolean(n)))];

  const allApps = await attempt("openFDA (Drugs@FDA)", problems, [] as Application[], () => applicationsForDrug(ingredientNames));
  // Combination products (e.g. sitagliptin-metformin) belong to other drug pages.
  const apps = allApps.filter((a) => a.ingredients.some((ing) => ing.length === 1 && baseDrugName(ing[0]) === drug));
  const companies = groupByCompany(apps);

  // Research is attributed to the original brand holders and the current label's manufacturer.
  const researchCompanies = [
    ...new Set([...companies.filter((c) => c.isInnovator).slice(0, 2).map((c) => c.core), ...(label ? [companyCore(label.manufacturer)] : [])]),
  ].slice(0, 3);

  // Short single-word names ("Sun") also match unrelated affiliations ("Sun Yat-sen University").
  const searchable = researchCompanies.filter((c) => c.includes(" ") || c.length >= 6);
  const terms = drugTerms(drug, label);
  // The drug must be a main subject (title or MeSH major topic), not a passing mention in another drug's study.
  const drugClause = mainTopicClause(terms);
  const companyClause = `(${searchable.map((c) => `"${c}"[ad] OR "${c}"[gr]`).join(" OR ")})`;

  const [trialLists, search] = await Promise.all([
    Promise.all(
      researchCompanies.map((c) => attempt("ClinicalTrials.gov", problems, [] as Trial[], () => trialsBySponsor(drug, c))),
    ),
    searchable.length
      ? attempt("PubMed", problems, { total: 0, ids: [] as string[], meshTerms: [] as string[] }, () =>
          searchPubMed(`${drugClause} AND ${companyClause} AND medline[sb]`, 25),
        )
      : Promise.resolve({ total: 0, ids: [] as string[], meshTerms: [] as string[] }),
  ]);

  const seen = new Set<string>();
  const trials = trialLists
    .flat()
    .filter((t) => t.sponsorClass === "INDUSTRY" && researchCompanies.some((c) => sameCompany(t.sponsor, c)))
    .filter((t) => (seen.has(t.nctId) ? false : (seen.add(t.nctId), true)));

  const articles = await attempt("PubMed", problems, [] as Article[], () => fetchPubMed(search.ids));
  const publications = await withFunding(articles, label, problems);

  return {
    drug,
    label,
    companies,
    researchCompanies,
    trials,
    publications,
    problems: problems.filter((p, i) => problems.findIndex((q) => q.source === p.source) === i),
  };
}
