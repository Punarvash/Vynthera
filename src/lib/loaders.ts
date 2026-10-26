import { cache } from "react";
import { getCases, getDrugOverview, getEvidence } from "./evidence";
import { summarizeEvidence } from "./ai-summary";
import { describeError } from "./http";
import { getCostBundle } from "./costs";
import { getCostDetails } from "./cost-details";
import { getManufacturerBundle } from "./manufacturer";
import { plainLanguage } from "./patient-info";
import { medlinePlusForRxcuis, type MedlinePlusEntry } from "./sources/medlineplus";
import type { SourceProblem } from "./types";

// Per-request memoization: the summary card and the tabs share one fetch of each bundle.
export const loadOverview = cache(getDrugOverview);
export const loadEvidence = cache(getEvidence);
export const loadCases = cache(getCases);
export const loadManufacturer = cache(getManufacturerBundle);
export const loadCosts = cache(getCostBundle);
export const loadCostDetails = cache(async (drug: string) => getCostDetails(await loadCosts(drug)));
export const loadSummary = cache(async (drug: string, condition: string | undefined) =>
  summarizeEvidence(await loadEvidence(drug, condition)),
);

export const loadPatientInfo = cache(async (drug: string, condition: string | undefined) => {
  const evidence = await loadEvidence(drug, condition);
  const problems: SourceProblem[] = [];
  let medline: MedlinePlusEntry[] = [];
  let medlineEs: MedlinePlusEntry[] = [];
  try {
    [medline, medlineEs] = evidence.label
      ? await Promise.all([medlinePlusForRxcuis(evidence.label.rxcuis), medlinePlusForRxcuis(evidence.label.rxcuis, "es").catch(() => [])])
      : [[], []];
  } catch (err) {
    problems.push({ source: "MedlinePlus", message: describeError(err) });
  }
  const costs = await loadCosts(drug).catch(() => null);
  return { evidence, medline, medlineEs, costs, plain: await plainLanguage(evidence, medline), problems };
});
