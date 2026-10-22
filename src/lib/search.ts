import { describeError } from "./http";
import { drugsByIndication, drugsByMechanism, getLabels, baseDrugName, namesDrug, pickBestLabel } from "./sources/openfda";
import { drugsForDisease, drugsForTarget, searchEntities, type CandidateDrug } from "./sources/opentargets";
import type { SourceProblem } from "./types";

export interface SearchResults {
  query: string;
  /** Set when the query is itself a drug name; the search page sends the user straight there. */
  exactDrug: string | null;
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

  const diseaseHit = hits.find((h) => h.entity === "disease");
  const targetHit = hits.find((h) => h.entity === "target");
  const [diseaseDrugs, targetDrugs] = await Promise.all([
    diseaseHit ? attempt("Open Targets", problems, [], () => drugsForDisease(diseaseHit.id)) : Promise.resolve([]),
    targetHit ? attempt("Open Targets", problems, [], () => drugsForTarget(targetHit.id)) : Promise.resolve([]),
  ]);

  return {
    query: q,
    exactDrug,
    byMechanism: byMechanism.slice(0, 40),
    byIndication: byIndication.slice(0, 40),
    disease: diseaseHit && diseaseDrugs.length ? { name: diseaseHit.name, drugs: diseaseDrugs.slice(0, 30) } : null,
    target: targetHit && targetDrugs.length ? { name: targetHit.name, drugs: targetDrugs.slice(0, 30) } : null,
    problems,
  };
}
