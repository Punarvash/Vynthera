import { describeError } from "./http";
import { classifyFunding } from "./funding";
import { assessGrade, uncertaintyStatement } from "./grade";
import { assessLabelStatus } from "./label-status";
import { compareDesign } from "./design";
import { baseDrugName, getLabel } from "./sources/openfda";
import { buildQuery, CASE_TYPES, EVIDENCE_TYPES, fetchPubMed, searchPubMed } from "./sources/pubmed";
import { searchPreprints } from "./sources/europepmc";
import { searchTrials, trialsByIds } from "./sources/clinicaltrials";
import { drugMechanisms } from "./sources/opentargets";
import type {
  Article,
  DrugLabel,
  GradeAssessment,
  LabelStatus,
  SourceProblem,
  TargetMechanism,
  Trial,
} from "./types";

/** Run one source; on failure record a visible problem and fall back, so one outage never blanks the page. */
export async function attempt<T>(source: string, problems: SourceProblem[], fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    problems.push({ source, message: describeError(err) });
    return fallback;
  }
}

export function cleanDrugName(raw: string): string {
  return decodeURIComponent(raw).replace(/[^\p{L}\p{N} \-/.,()]/gu, "").trim().slice(0, 80);
}

export function cleanCondition(raw: string | string[] | undefined): string | undefined {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.replace(/[^\p{L}\p{N} \-'/.,()]/gu, "").trim().slice(0, 120);
  return v ? v : undefined;
}

export function drugTerms(name: string, label: DrugLabel | null): string[] {
  const terms = [name, label && baseDrugName(label.genericName), label?.genericName, ...(label?.brandNames ?? [])].filter(
    (t): t is string => Boolean(t),
  );
  return [...new Set(terms.map((t) => t.toLowerCase()))].slice(0, 5);
}

export interface DrugOverview {
  name: string;
  label: DrugLabel | null;
  mechanisms: TargetMechanism[];
  problems: SourceProblem[];
}

export async function getDrugOverview(name: string): Promise<DrugOverview> {
  const problems: SourceProblem[] = [];
  const [label, moa] = await Promise.all([
    attempt("openFDA", problems, null, () => getLabel(name)),
    attempt("Open Targets", problems, null, () => drugMechanisms(name)),
  ]);
  return { name: label ? baseDrugName(label.genericName) : name.toLowerCase(), label, mechanisms: moa?.mechanisms ?? [], problems };
}

export async function withFunding(articles: Article[], label: DrugLabel | null, problems: SourceProblem[]): Promise<Article[]> {
  const ids = [...new Set(articles.flatMap((a) => a.nctIds))];
  const linked = await attempt("ClinicalTrials.gov", problems, [] as Trial[], () => trialsByIds(ids));
  const byId = new Map(linked.map((t) => [t.nctId, t]));
  const manufacturers = label ? [label.manufacturer] : [];
  return articles.map((a) => ({ ...a, funding: classifyFunding(a, byId, manufacturers) }));
}

async function literature(
  name: string,
  condition: string | undefined,
  typeFilter: string,
  retmax: number,
  problems: SourceProblem[],
  label: DrugLabel | null,
) {
  const terms = drugTerms(name, label);
  const [search, preprints] = await Promise.all([
    attempt("PubMed", problems, { total: 0, ids: [] as string[] }, () =>
      searchPubMed(buildQuery(terms, condition, typeFilter), retmax),
    ),
    attempt("Europe PMC", problems, [] as Article[], () => searchPreprints(terms, condition)),
  ]);
  const articles = await attempt("PubMed", problems, [] as Article[], () => fetchPubMed(search.ids));
  return { total: search.total, articles, preprints, terms };
}

export interface EvidenceBundle {
  drug: string;
  condition?: string;
  label: DrugLabel | null;
  labelStatus: LabelStatus;
  studies: Article[];
  totalStudies: number;
  preprints: Article[];
  trials: Trial[];
  totalTrials: number;
  grade: GradeAssessment;
  uncertainty: string[];
  problems: SourceProblem[];
}

export async function getEvidence(name: string, condition: string | undefined): Promise<EvidenceBundle> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();

  const [lit, trialSearch] = await Promise.all([
    literature(drug, condition, EVIDENCE_TYPES, 40, problems, label),
    attempt("ClinicalTrials.gov", problems, { total: 0, trials: [] as Trial[] }, () => searchTrials(drug, condition)),
  ]);

  const studies = (await withFunding(lit.articles, label, problems)).sort((a, b) => compareDesign(a.design, b.design));
  const preprints = (await withFunding(lit.preprints, label, problems)).filter((a) =>
    ["meta-analysis", "systematic-review", "rct", "clinical-trial", "observational", "other"].includes(a.design),
  );
  const labelStatus = assessLabelStatus(label, condition);
  const grade = assessGrade([...studies, ...preprints]);

  return {
    drug,
    condition,
    label,
    labelStatus,
    studies,
    totalStudies: lit.total,
    preprints,
    trials: trialSearch.trials,
    totalTrials: trialSearch.total,
    grade,
    uncertainty: uncertaintyStatement({ drug, condition, grade, articles: studies, trials: trialSearch.trials, labelStatus }),
    problems: dedupeProblems(problems),
  };
}

export interface CaseBundle {
  drug: string;
  condition?: string;
  cases: Article[];
  totalCases: number;
  preprints: Article[];
  problems: SourceProblem[];
}

export async function getCases(name: string, condition: string | undefined): Promise<CaseBundle> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();
  const lit = await literature(drug, condition, CASE_TYPES, 30, problems, label);
  const cases = await withFunding(lit.articles, label, problems);
  const preprints = (await withFunding(lit.preprints, label, problems)).filter(
    (a) => a.design === "case-report" || a.design === "case-series",
  );
  return { drug, condition, cases, totalCases: lit.total, preprints, problems: dedupeProblems(problems) };
}

function dedupeProblems(problems: SourceProblem[]): SourceProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => (seen.has(p.source) ? false : (seen.add(p.source), true)));
}
