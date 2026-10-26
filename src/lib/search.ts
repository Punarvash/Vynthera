import { describeError } from "./http";
import { drugsByIndication, drugsByMechanism, getLabels, baseDrugName, namesDrug, pickBestLabel } from "./sources/openfda";
import { drugsForDisease, drugsForTarget, searchEntities, type CandidateDrug } from "./sources/opentargets";
import type { SourceProblem } from "./types";

export interface DrugMatch {
  /** Ingredient name used in drug page links, so every route opens the same page. */
  name: string;
  brandNames: string[];
  routes: string[];
  drugClass?: string;
  /** True when the query names this drug (generic or brand). */
  exact: boolean;
}

export interface SearchResults {
  query: string;
  /** Set when the query is itself a drug name. */
  exactDrug: string | null;
  /** Drugs whose FDA labels match the query by name, the exact match first. */
  drugs: DrugMatch[];
  byMechanism: { name: string; classes: string[] }[];
  byIndication: string[];
  disease: { name: string; drugs: CandidateDrug[] } | null;
  target: { name: string; drugs: CandidateDrug[] } | null;
  problems: SourceProblem[];
}

async function attempt<T>(source: string, problems: SourceProblem[], fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!problems.some((p) => p.source === source)) problems.push({ source, message: describeError(err) });
    return fallback;
  }
}

/** One search box accepts a drug, a condition or a mechanism; run all three interpretations at once. */
export async function runSearch(query: string): Promise<SearchResults> {
  const problems: SourceProblem[] = [];
  const q = query.trim();
  const [labels, byMechanism, byIndication, hits] = await Promise.all([
    attempt("openFDA", problems, [], () => getLabels(q)),
    attempt("openFDA", problems, [], () => drugsByMechanism(q)),
    attempt("openFDA", problems, [], () => drugsByIndication(q)),
    attempt("Open Targets", problems, [], () => searchEntities(q)),
  ]);

  const best = pickBestLabel(labels, q);
  const exactDrug = best && namesDrug(best, q) ? baseDrugName(best.genericName) : null;
  const groups = new Map<string, DrugMatch>();
  for (const l of labels) {
    const name = baseDrugName(l.genericName);
    const g = groups.get(name) ?? { name, brandNames: [], routes: [], exact: name === exactDrug, drugClass: undefined as string | undefined };
    g.brandNames = [...new Set([...g.brandNames, ...l.brandNames])];
    g.routes = [...new Set([...g.routes, ...l.routes.map((r) => r.toLowerCase())])];
    g.drugClass ??= l.pharmClassEpc[0]?.replace(/\s*\[EPC\]$/, "");
    groups.set(name, g);
  }
  const drugs = [...groups.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || a.name.length - b.name.length).slice(0, 8);

  const diseaseHit = hits.find((h) => h.entity === "disease");
  const targetHit = hits.find((h) => h.entity === "target");
  const [diseaseDrugs, targetDrugs] = await Promise.all([
    diseaseHit ? attempt("Open Targets", problems, [], () => drugsForDisease(diseaseHit.id)) : Promise.resolve([]),
    targetHit ? attempt("Open Targets", problems, [], () => drugsForTarget(targetHit.id)) : Promise.resolve([]),
  ]);

  return {
    query: q,
    exactDrug,
    drugs,
    byMechanism: byMechanism.slice(0, 40),
    byIndication: byIndication.slice(0, 40),
    disease: diseaseHit && diseaseDrugs.length ? { name: diseaseHit.name, drugs: diseaseDrugs.slice(0, 30) } : null,
    target: targetHit && targetDrugs.length ? { name: targetHit.name, drugs: targetDrugs.slice(0, 30) } : null,
    problems,
  };
}
