import { cacheLife } from "next/cache";
import { getJson } from "../http";
import type { SponsorClass, Trial, TrialOutcome } from "../types";

// ClinicalTrials.gov API v2: https://clinicaltrials.gov/data-api/api
const BASE = "https://clinicaltrials.gov/api/v2/studies";
const SOURCE = "ClinicalTrials.gov";
const FIELDS = [
  "NCTId",
  "BriefTitle",
  "LeadSponsorName",
  "LeadSponsorClass",
  "OverallStatus",
  "Phase",
  "StudyType",
  "EnrollmentCount",
  "HasResults",
  "StartDate",
  "Condition",
].join(",");

interface RawStudy {
  hasResults?: boolean;
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string; class?: string } };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } };
    designModule?: { phases?: string[]; studyType?: string; enrollmentInfo?: { count?: number } };
    conditionsModule?: { conditions?: string[] };
  };
}

interface RawResponse {
  totalCount?: number;
  studies?: RawStudy[];
}

const SPONSOR_CLASSES: SponsorClass[] = ["INDUSTRY", "NIH", "FED", "OTHER_GOV", "INDIV", "NETWORK", "AMBIG", "OTHER", "UNKNOWN"];

export function toTrial(s: RawStudy): Trial | null {
  const p = s.protocolSection;
  const nctId = p?.identificationModule?.nctId;
  if (!p || !nctId) return null;
  const rawClass = p.sponsorCollaboratorsModule?.leadSponsor?.class ?? "UNKNOWN";
  return {
    nctId,
    title: p.identificationModule?.briefTitle ?? nctId,
    sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? "Not listed",
    sponsorClass: SPONSOR_CLASSES.includes(rawClass as SponsorClass) ? (rawClass as SponsorClass) : "UNKNOWN",
    status: p.statusModule?.overallStatus ?? "UNKNOWN",
    phases: p.designModule?.phases ?? [],
    studyType: p.designModule?.studyType ?? "",
    enrollment: p.designModule?.enrollmentInfo?.count,
    hasResults: Boolean(s.hasResults),
    startDate: p.statusModule?.startDateStruct?.date,
    conditions: p.conditionsModule?.conditions ?? [],
    url: `https://clinicaltrials.gov/study/${nctId}`,
  };
}

function parse(data: RawResponse): Trial[] {
  return (data.studies ?? []).map(toTrial).filter((t): t is Trial => t !== null);
}

export async function searchTrials(
  drug: string,
  condition: string | undefined,
  pageSize = 50,
): Promise<{ total: number; trials: Trial[] }> {
  "use cache";
  cacheLife("days");
  const cond = condition ? `&query.cond=${encodeURIComponent(condition)}` : "";
  const url = `${BASE}?format=json&countTotal=true&pageSize=${pageSize}&query.intr=${encodeURIComponent(drug)}${cond}&fields=${FIELDS}`;
  const data = await getJson<RawResponse>(SOURCE, url);
  return { total: data.totalCount ?? 0, trials: parse(data) };
}

/** Look up specific registered trials (e.g. NCT IDs cited by PubMed articles) to learn their sponsor. */
export async function trialsByIds(ids: string[]): Promise<Trial[]> {
  "use cache";
  cacheLife("days");
  if (ids.length === 0) return [];
  const url = `${BASE}?format=json&pageSize=${Math.min(ids.length, 100)}&filter.ids=${ids.slice(0, 100).join(",")}&fields=${FIELDS}`;
  return parse(await getJson<RawResponse>(SOURCE, url));
}

export function isIndustry(c: SponsorClass): boolean {
  return c === "INDUSTRY";
}

/** Sponsor classes we can confidently call non-industry. */
export function isIndependent(c: SponsorClass): boolean {
  return c === "NIH" || c === "FED" || c === "OTHER_GOV" || c === "NETWORK" || c === "OTHER" || c === "INDIV";
}

export function formatPhase(phases: string[]): string {
  if (phases.length === 0 || phases.includes("NA")) return "";
  return phases.map((p) => p.replace(/^EARLY_PHASE1$/, "Early phase 1").replace(/^PHASE(\d)$/, "Phase $1")).join("/");
}

export function formatStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Trials of a drug led by a given sponsor (e.g. its manufacturer). */
export async function trialsBySponsor(drug: string, sponsor: string, pageSize = 20): Promise<Trial[]> {
  "use cache";
  cacheLife("days");
  const url = `${BASE}?format=json&pageSize=${pageSize}&query.intr=${encodeURIComponent(drug)}&query.spons=${encodeURIComponent(sponsor)}&fields=${FIELDS}`;
  return parse(await getJson<RawResponse>(SOURCE, url));
}

/* eslint-disable @typescript-eslint/no-explicit-any -- results sections are deeply nested */
/** First primary outcome measure with posted results, flattened for display. */
export function parsePrimaryOutcome(study: any): TrialOutcome | undefined {
  const measures: any[] = study?.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
  const m = measures.find((x) => x.type === "PRIMARY") ?? measures[0];
  if (!m?.title) return undefined;
  const groups: any[] = m.groups ?? [];
  const counts = new Map<string, string>(
    (m.denoms?.[0]?.counts ?? []).map((c: any) => [String(c.groupId), String(c.value)]),
  );
  const measurements: any[] = m.classes?.[0]?.categories?.[0]?.measurements ?? [];
  const valueFor = (id: string) => {
    const x = measurements.find((v) => v.groupId === id);
    if (!x?.value) return "";
    if (x.spread) return `${x.value} ± ${x.spread}`;
    if (x.lowerLimit && x.upperLimit) return `${x.value} (${x.lowerLimit} to ${x.upperLimit})`;
    return String(x.value);
  };
  return {
    title: String(m.title),
    timeFrame: m.timeFrame ? String(m.timeFrame) : undefined,
    unit: m.unitOfMeasure ? String(m.unitOfMeasure) : undefined,
    groups: groups.slice(0, 4).map((g) => ({
      title: String(g.title ?? g.id),
      participants: counts.get(String(g.id)),
      value: valueFor(String(g.id)),
    })),
    pValue: m.analyses?.find((a: any) => a.pValue)?.pValue,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function trialResult(nctId: string): Promise<TrialOutcome | undefined> {
  "use cache";
  cacheLife("weeks");
  if (!/^NCT\d{8}$/.test(nctId)) return undefined;
  const study = await getJson<unknown>(SOURCE, `${BASE}/${nctId}?format=json`);
  return parsePrimaryOutcome(study);
}

/** Completed trials with posted results first, then active ones, then the rest. */
export function trialOrder(t: Trial): number {
  if (t.hasResults) return 0;
  if (t.status === "COMPLETED") return 1;
  if (/RECRUITING|ACTIVE|ENROLLING/.test(t.status)) return 2;
  return 3;
}
