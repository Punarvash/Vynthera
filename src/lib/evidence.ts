import { describeError } from "./http";
import { classifyFunding, fundingFromStatement } from "./funding";
import { assessGrade, countsFromStudies, uncertaintyStatement, verdict } from "./grade";
import { assessLabelStatus } from "./label-status";
import { compareDesign } from "./design";
import { assessDirections, indicationQuote } from "./ai-assess";
import { isAboutDrug } from "./study-features";
import { baseDrugName, getLabel } from "./sources/openfda";
import {
  buildQuery,
  CASE_TYPES,
  COUNT_FILTERS,
  EVIDENCE_TYPES,
  fetchPubMed,
  meshSynonyms,
  searchPubMed,
  uninvert,
} from "./sources/pubmed";
import { fullTextDisclosures, literatureProfile, searchPreprints, type LiteratureProfile } from "./sources/europepmc";
import { searchTrials, trialOrder, trialResult, trialsByIds } from "./sources/clinicaltrials";
import { drugMechanisms } from "./sources/opentargets";
import { abbreviationSynonyms } from "./condition-synonyms";
import type {
  Article,
  DesignCounts,
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
  options: { therapy?: boolean; retstart?: number; preprints?: boolean } = {},
) {
  const terms = drugTerms(name, label);
  const run = (therapy: boolean) => searchPubMed(buildQuery(terms, condition, typeFilter, { therapy }), retmax, options.retstart ?? 0);
  const [first, preprints] = await Promise.all([
    attempt("PubMed", problems, { total: 0, ids: [] as string[], meshTerms: [] as string[] }, () => run(Boolean(options.therapy))),
    options.preprints === false
      ? Promise.resolve([] as Article[])
      : attempt("Europe PMC", problems, [] as Article[], () => searchPreprints(terms, condition)),
  ]);
  // The therapy filter is a precision aid; if it removes everything, fall back to the plain search.
  const search =
    options.therapy && first.total === 0
      ? await attempt("PubMed", problems, { total: 0, ids: [] as string[], meshTerms: [] as string[] }, () => run(false))
      : first;
  const fetched = await attempt("PubMed", problems, [] as Article[], () => fetchPubMed(search.ids));
  const mark = (a: Article) => ({ ...a, aboutDrug: isAboutDrug(a, terms) });
  // MeSH headings PubMed mapped the condition to (drug headings removed), a backup source of synonyms.
  const conditionMesh = search.meshTerms.filter((m) => !terms.some((t) => m.includes(t)));
  return { total: search.total, articles: fetched.map(mark), preprints: preprints.map(mark), terms, conditionMesh };
}

async function cochraneReviews(terms: string[], condition: string): Promise<Article[]> {
  const r = await searchPubMed(buildQuery(terms, condition, '"Cochrane Database Syst Rev"[ta]'), 5);
  return r.ids.length ? fetchPubMed(r.ids) : [];
}

/** Full PubMed counts by design for studies where the drug is a main topic. */
async function designCounts(terms: string[], condition: string | undefined, problems: SourceProblem[]): Promise<DesignCounts | null> {
  const entries = Object.entries(COUNT_FILTERS) as [keyof DesignCounts, string][];
  const failed: string[] = [];
  const results = await Promise.all(
    entries.map(async ([key, filter]) => {
      try {
        const r = await searchPubMed(buildQuery(terms, condition, filter, { mainTopic: true }), 0);
        return [key, r.total] as const;
      } catch (err) {
        failed.push(describeError(err));
        return [key, 0] as const;
      }
    }),
  );
  if (failed.length === entries.length) {
    problems.push({ source: "PubMed", message: failed[0] });
    return null;
  }
  return Object.fromEntries(results) as unknown as DesignCounts;
}

/** Add funding found in open-access full texts, for studies the registry and PubMed record left unlabelled. */
async function withFullTextFunding(
  articles: Article[],
  label: DrugLabel | null,
  profile: LiteratureProfile | null,
  limit = 12,
): Promise<Article[]> {
  const manufacturers = label ? [label.manufacturer] : [];
  // Only open-access articles have a reusable full text; asking for others just fails slowly.
  const open = new Set(profile?.openAccess ?? []);
  const targets = articles.filter((a) => a.pmcid && a.pmid && open.has(a.pmid) && a.funding.kind === "unreported").slice(0, limit);
  const disclosures = new Map<string, Awaited<ReturnType<typeof fullTextDisclosures>>>();
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const found = await Promise.all(batch.map((a) => fullTextDisclosures(a.pmcid as string).catch(() => null)));
    batch.forEach((a, j) => disclosures.set(a.id, found[j]));
  }
  return articles.map((a) => {
    const d = disclosures.get(a.id);
    if (!d) return a;
    const funding = a.funding.kind === "unreported" ? (fundingFromStatement(d, manufacturers) ?? a.funding) : a.funding;
    return { ...a, funding, fundingStatement: d.funding, coiStatement: d.coi };
  });
}

function withCitations(articles: Article[], profile: LiteratureProfile | null): Article[] {
  if (!profile) return articles;
  return articles.map((a) => (a.pmid && profile.citations[a.pmid] !== undefined ? { ...a, citations: profile.citations[a.pmid] } : a));
}

/** Main-topic studies first; Cochrane reviews lead their design group. */
function orderStudies(articles: Article[]): Article[] {
  return [...articles].sort(
    (a, b) =>
      Number(b.aboutDrug) - Number(a.aboutDrug) ||
      compareDesign(a.design, b.design) ||
      Number(b.cochrane) - Number(a.cochrane) ||
      (b.citations ?? 0) - (a.citations ?? 0),
  );
}

export interface EvidenceBundle {
  drug: string;
  condition?: string;
  label: DrugLabel | null;
  labelStatus: LabelStatus;
  /** The condition's MeSH synonyms used for searching and the off-label check. */
  synonyms: string[];
  studies: Article[];
  totalStudies: number;
  /** Full counts by design, with the drug as a main topic. */
  counts: DesignCounts;
  countsAreFull: boolean;
  profile: LiteratureProfile | null;
  preprints: Article[];
  trials: Trial[];
  totalTrials: number;
  grade: GradeAssessment;
  verdict: string;
  uncertainty: string[];
  aiAssessed: boolean;
  problems: SourceProblem[];
}

export const PAGE_SIZE = 40;

export async function getEvidence(name: string, condition: string | undefined): Promise<EvidenceBundle> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();
  const terms = drugTerms(drug, label);

  const [lit, counts, trialSearch, profile, meshEntryTerms, cochrane] = await Promise.all([
    literature(drug, condition, EVIDENCE_TYPES, PAGE_SIZE, problems, label, { therapy: true }),
    designCounts(terms, condition, problems),
    attempt("ClinicalTrials.gov", problems, { total: 0, trials: [] as Trial[] }, () => searchTrials(drug, condition)),
    attempt("Europe PMC", problems, null as LiteratureProfile | null, () => literatureProfile(terms, condition)),
    condition ? attempt("PubMed", problems, [] as string[], () => meshSynonyms(condition)) : Promise.resolve([] as string[]),
    // Cochrane reviews of this use, so the most rigorous graded evidence is never missed by relevance ranking.
    condition ? attempt("PubMed", problems, [] as Article[], () => cochraneReviews(terms, condition)) : Promise.resolve([] as Article[]),
  ]);

  const synonyms = [...new Set([...(condition ? abbreviationSynonyms(condition) : []), ...meshEntryTerms, ...lit.conditionMesh.flatMap((m) => [m, uninvert(m)])])];

  const known = new Set(lit.articles.map((a) => a.id));
  const extra = cochrane.filter((a) => !known.has(a.id)).map((a) => ({ ...a, aboutDrug: isAboutDrug(a, terms) }));
  let studies = await withFunding([...lit.articles, ...extra], label, problems);
  studies = await withFullTextFunding(studies, label, profile);
  studies = orderStudies(withCitations(studies, profile));

  // Direction of effect for the main-topic studies, when an AI key is configured.
  let aiAssessed = false;
  if (condition) {
    const rated = studies.filter((a) => a.aboutDrug && !["case-report", "case-series", "review", "other"].includes(a.design));
    const assessed = await assessDirections(drug, condition, rated);
    if (assessed) {
      aiAssessed = true;
      studies = studies.map((a) => {
        const x = assessed.get(a.id);
        return x ? { ...a, direction: x.direction, sampleSize: a.sampleSize ?? x.participants ?? undefined } : a;
      });
    }
  }

  const preprints = (await withFunding(lit.preprints, label, problems)).filter((a) =>
    ["meta-analysis", "systematic-review", "rct", "clinical-trial", "observational", "other"].includes(a.design),
  );
  let labelStatus = assessLabelStatus(label, condition, synonyms);
  if (labelStatus.kind === "off-label" && label && condition) {
    // Wording the text match cannot connect to the condition; Claude reads the indications, and its quote is checked against the label.
    const [indicated] = label.indications.split(/limitations?\s+of\s+use/i);
    const quote = await indicationQuote(drug, condition, indicated);
    if (quote) labelStatus = { kind: "likely-approved", matched: quote, byAi: true };
  }
  const fullCounts = counts ?? countsFromStudies(studies.filter((a) => a.aboutDrug));
  const grade = assessGrade({
    condition,
    counts: counts,
    rated: studies.filter((a) => a.aboutDrug && a.peerReviewed),
    conditionPhrases: condition ? [condition, ...synonyms] : [],
    directionsAssessed: aiAssessed,
  });

  // Completed trials with posted results first, with their primary outcome.
  const ordered = [...trialSearch.trials].sort((a, b) => trialOrder(a) - trialOrder(b));
  const withResults = await Promise.all(
    ordered.map(async (t, i) =>
      t.hasResults && i < 5 ? { ...t, result: await trialResult(t.nctId).catch(() => undefined) } : t,
    ),
  );

  return {
    drug,
    condition,
    label,
    labelStatus,
    synonyms,
    studies,
    totalStudies: lit.total,
    counts: fullCounts,
    countsAreFull: counts !== null,
    profile,
    preprints,
    trials: withResults,
    totalTrials: trialSearch.total,
    grade,
    verdict: verdict(grade.level, drug, condition, fullCounts),
    uncertainty: uncertaintyStatement({ drug, condition, grade, articles: studies.filter((a) => a.aboutDrug), trials: trialSearch.trials, labelStatus }),
    aiAssessed,
    problems: dedupeProblems(problems),
  };
}

/** The next page of studies, for "Load more". */
export async function getMoreStudies(name: string, condition: string | undefined, offset: number): Promise<Article[]> {
  const problems: SourceProblem[] = [];
  const label = await attempt("openFDA", problems, null, () => getLabel(name));
  const drug = label ? baseDrugName(label.genericName) : name.toLowerCase();
  const lit = await literature(drug, condition, EVIDENCE_TYPES, PAGE_SIZE, problems, label, {
    therapy: true,
    retstart: offset,
    preprints: false,
  });
  if (problems.length) throw new Error("PubMed is not responding right now.");
  const terms = drugTerms(drug, label);
  const profile = await literatureProfile(terms, condition).catch(() => null);
  const studies = await withFullTextFunding(await withFunding(lit.articles, label, problems), label, profile, 8);
  return orderStudies(withCitations(studies, profile));
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
  // Case reports about the drug come before ones that only mention it.
  const profile = await literatureProfile(lit.terms, condition).catch(() => null);
  const cases = orderStudies(withCitations(await withFullTextFunding(await withFunding(lit.articles, label, problems), label, profile, 8), profile));
  const preprints = (await withFunding(lit.preprints, label, problems)).filter(
    (a) => a.design === "case-report" || a.design === "case-series",
  );
  return { drug, condition, cases, totalCases: lit.total, preprints, problems: dedupeProblems(problems) };
}

function dedupeProblems(problems: SourceProblem[]): SourceProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => (seen.has(p.source) ? false : (seen.add(p.source), true)));
}
