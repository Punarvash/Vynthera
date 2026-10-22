import { cacheLife } from "next/cache";
import { getJson, SourceError } from "../http";
import type { TargetMechanism } from "../types";

// Open Targets Platform GraphQL API: https://platform-docs.opentargets.org/data-access/graphql-api
const URL = "https://api.platform.opentargets.org/api/v4/graphql";
const SOURCE = "Open Targets";

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await getJson<{ data?: T; errors?: { message: string }[] }>(SOURCE, URL, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  });
  if (res.errors?.length || !res.data) {
    throw new SourceError(SOURCE, res.errors?.[0]?.message ?? "returned no data");
  }
  return res.data;
}

export interface SearchHit {
  id: string;
  entity: "drug" | "disease" | "target";
  name: string;
  description?: string;
}

export async function searchEntities(q: string): Promise<SearchHit[]> {
  "use cache";
  cacheLife("days");
  const data = await gql<{ search: { hits: SearchHit[] } }>(
    `query Search($q: String!) {
      search(queryString: $q, entityNames: ["drug", "disease", "target"], page: { index: 0, size: 8 }) {
        hits { id entity name description }
      }
    }`,
    { q },
  );
  return data.search.hits;
}

// Open Targets 25.x replaced "knownDrugs" with "drugAndClinicalCandidates".
interface CandidateRow {
  maxClinicalStage?: string;
  drug?: { id: string; name: string; mechanismsOfAction?: { rows: { mechanismOfAction: string }[] } } | null;
}

export interface CandidateDrug {
  name: string;
  chemblId: string;
  mechanism?: string;
  maxPhase?: number;
}

/** "APPROVAL" -> 4, "PHASE_2_3" -> 3, "PHASE_1" -> 1, anything else -> undefined. */
export function stageToPhase(stage: string | undefined): number | undefined {
  if (!stage) return undefined;
  if (/approv/i.test(stage)) return 4;
  const digits = stage.match(/\d/g)?.map(Number);
  return digits?.length ? Math.max(...digits) : undefined;
}

export function toCandidates(rows: CandidateRow[]): CandidateDrug[] {
  const byId = new Map<string, CandidateDrug>();
  for (const r of rows) {
    if (!r.drug) continue;
    const phase = stageToPhase(r.maxClinicalStage);
    const prev = byId.get(r.drug.id);
    if (!prev || (phase ?? 0) > (prev.maxPhase ?? 0)) {
      byId.set(r.drug.id, {
        name: r.drug.name.toLowerCase(),
        chemblId: r.drug.id,
        mechanism: r.drug.mechanismsOfAction?.rows[0]?.mechanismOfAction,
        maxPhase: phase,
      });
    }
  }
  return [...byId.values()].sort((a, b) => (b.maxPhase ?? 0) - (a.maxPhase ?? 0));
}

const CANDIDATE_FIELDS = `drugAndClinicalCandidates { rows { maxClinicalStage drug { id name mechanismsOfAction { rows { mechanismOfAction } } } } }`;

/** Drugs studied for a disease (any phase, any regulator), for condition searches. */
export async function drugsForDisease(efoId: string): Promise<CandidateDrug[]> {
  "use cache";
  cacheLife("days");
  const data = await gql<{ disease: { drugAndClinicalCandidates?: { rows: CandidateRow[] } } | null }>(
    `query DiseaseDrugs($id: String!) { disease(efoId: $id) { ${CANDIDATE_FIELDS} } }`,
    { id: efoId },
  );
  return toCandidates(data.disease?.drugAndClinicalCandidates?.rows ?? []);
}

/** Drugs acting on a target, for mechanism searches such as "GLP-1 receptor". */
export async function drugsForTarget(ensemblId: string): Promise<CandidateDrug[]> {
  "use cache";
  cacheLife("days");
  const data = await gql<{ target: { drugAndClinicalCandidates?: { rows: CandidateRow[] } } | null }>(
    `query TargetDrugs($id: String!) { target(ensemblId: $id) { ${CANDIDATE_FIELDS} } }`,
    { id: ensemblId },
  );
  return toCandidates(data.target?.drugAndClinicalCandidates?.rows ?? []);
}

/** Molecular mechanism(s) and targets for a drug name. */
export async function drugMechanisms(name: string): Promise<{ chemblId: string; mechanisms: TargetMechanism[] } | null> {
  "use cache";
  cacheLife("days");
  const hits = await searchEntities(name);
  const drug = hits.find((h) => h.entity === "drug" && h.name.toLowerCase() === name.toLowerCase()) ??
    hits.find((h) => h.entity === "drug");
  if (!drug) return null;
  const data = await gql<{
    drug: {
      mechanismsOfAction?: {
        rows: { mechanismOfAction: string; actionType?: string; targets?: { approvedSymbol: string }[] }[];
      };
    } | null;
  }>(
    `query DrugMoa($id: String!) {
      drug(chemblId: $id) {
        mechanismsOfAction { rows { mechanismOfAction actionType targets { approvedSymbol } } }
      }
    }`,
    { id: drug.id },
  );
  const rows = data.drug?.mechanismsOfAction?.rows ?? [];
  return {
    chemblId: drug.id,
    mechanisms: rows.map((r) => ({
      mechanismOfAction: r.mechanismOfAction,
      actionType: r.actionType,
      targets: (r.targets ?? []).map((t) => t.approvedSymbol),
    })),
  };
}
