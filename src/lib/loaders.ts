import { cache } from "react";
import { getCases, getDrugOverview, getEvidence } from "./evidence";
import { summarizeEvidence } from "./ai-summary";

// Per-request memoization: the summary card and the tabs share one fetch of each bundle.
export const loadOverview = cache(getDrugOverview);
export const loadEvidence = cache(getEvidence);
export const loadCases = cache(getCases);
export const loadSummary = cache(async (drug: string, condition: string | undefined) =>
  summarizeEvidence(await loadEvidence(drug, condition)),
);
