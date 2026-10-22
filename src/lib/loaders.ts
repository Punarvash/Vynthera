import { cache } from "react";
import { getCases, getDrugOverview, getEvidence } from "./evidence";
import { summarizeEvidence } from "./ai-summary";
import { describeError } from "./http";
import { plainLanguage } from "./patient-info";
import { medlinePlusForRxcuis, type MedlinePlusEntry } from "./sources/medlineplus";
import type { SourceProblem } from "./types";

// Per-request memoization: the summary card and the tabs share one fetch of each bundle.
export const loadOverview = cache(getDrugOverview);
export const loadEvidence = cache(getEvidence);
export const loadCases = cache(getCases);
export const loadSummary = cache(async (drug: string, condition: string | undefined) =>
  summarizeEvidence(await loadEvidence(drug, condition)),
);

export const loadPatientInfo = cache(async (drug: string, condition: string | undefined) => {
  const evidence = await loadEvidence(drug, condition);
  const problems: SourceProblem[] = [];
  let medline: MedlinePlusEntry[] = [];
  try {
    medline = evidence.label ? await medlinePlusForRxcuis(evidence.label.rxcuis) : [];
  } catch (err) {
    problems.push({ source: "MedlinePlus", message: describeError(err) });
  }
  return { evidence, medline, plain: await plainLanguage(evidence, medline), problems };
});
