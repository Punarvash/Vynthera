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

interface KnownDrugRow {
  drugId: string;
  prefName: string;
  mechanismOfAction?: string;
  phase?: number;
}

export interface CandidateDrug {
  name: string;
  chemblId: string;
  mechanism?: string;
  maxPhase?: number;
}

function dedupeDrugs(rows: KnownDrugRow[]): CandidateDrug[] {
  const byId = new Map<string, CandidateDrug>();
  for (const r of rows) {
    const prev = byId.get(r.drugId);
    if (!prev || (r.phase ?? 0) > (prev.maxPhase ?? 0)) {
      byId.set(r.drugId, { name: r.prefName.toLowerCase(), chemblId: r.drugId, mechanism: r.mechanismOfAction, maxPhase: r.phase });
    }
  }
  return [...byId.values()].sort((a, b) => (b.maxPhase ?? 0) - (a.maxPhase ?? 0));
}

/** Drugs studied for a disease (any phase, any regulator), for condition searches. */
export async function drugsForDisease(efoId: string): Promise<CandidateDrug[]> {
  "use cache";
  cacheLife("days");
  const data = await gql<{ disease: { knownDrugs?: { rows: KnownDrugRow[] } } | null }>(
    `query DiseaseDrugs($id: String!) {
      disease(efoId: $id) { knownDrugs(size: 100) { rows { drugId prefName mechanismOfAction phase } } }
    }`,
    { id: efoId },
  );
  return dedupeDrugs(data.disease?.knownDrugs?.rows ?? []);
}

/** Drugs acting on a target, for mechanism searches such as "GLP-1 receptor". */
export async function drugsForTarget(ensemblId: string): Promise<CandidateDrug[]> {
  "use cache";
  cacheLife("days");
  const data = await gql<{ target: { knownDrugs?: { rows: KnownDrugRow[] } } | null }>(
    `query TargetDrugs($id: String!) {
      target(ensemblId: $id) { knownDrugs(size: 100) { rows { drugId prefName mechanismOfAction phase } } }
    }`,
    { id: ensemblId },
  );
  return dedupeDrugs(data.target?.knownDrugs?.rows ?? []);
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
