import { cacheLife } from "next/cache";
import { getJson } from "../http";

// HealthCare.gov Marketplace API (ACA individual-market plans): https://developer.cms.gov/marketplace-api/
// Works only when MARKETPLACE_API_KEY is set; the Costs tab hides the section otherwise.
const BASE = "https://marketplace.api.healthcare.gov/api/v1";
const SOURCE = "HealthCare.gov";

export function marketplaceEnabled(): boolean {
  return Boolean(process.env.MARKETPLACE_API_KEY);
}

function key(): string {
  return `apikey=${encodeURIComponent(process.env.MARKETPLACE_API_KEY ?? "")}`;
}

interface County {
  fips: string;
  name: string;
  state: string;
  zipcode: string;
}

interface CostSharing {
  network_tier?: string;
  copay_amount?: number;
  coinsurance_rate?: number;
  display_string?: string;
}

interface RawPlan {
  id: string;
  name: string;
  issuer?: { name?: string };
  metal_level?: string;
  type?: string;
  premium?: number;
  benefits?: { name?: string; covered?: boolean; cost_sharings?: CostSharing[] }[];
}

export type MarketplaceCoverage = "Covered" | "GenericCovered" | "NotCovered" | "DataNotProvided";

export interface MarketplacePlan {
  id: string;
  name: string;
  issuer: string;
  metal: string;
  type: string;
  /** Monthly premium for the sample enrollee, before subsidies. */
  premium?: number;
  coverage: MarketplaceCoverage;
  /** Drug cost sharing by tier, as the plan states it ("$10 Copay after deductible"). */
  drugCosts: { tier: string; text: string }[];
}

const DRUG_TIERS = ["Generic Drugs", "Preferred Brand Drugs", "Non-Preferred Brand Drugs", "Specialty Drugs"];

function inNetwork(cs: CostSharing[] | undefined): string | undefined {
  const s = (cs ?? []).find((c) => /in.?network|tier ?1/i.test(c.network_tier ?? "")) ?? cs?.[0];
  return s?.display_string?.trim();
}

/**
 * ACA Marketplace plans sold in a ZIP code and whether each covers the drug (any of its RxCUIs).
 * Uses a sample 40-year-old non-smoker to list plans; premiums are before tax credits.
 */
export async function marketplacePlans(zip: string, rxcuis: string[], year: number): Promise<{ county: string; state: string; plans: MarketplacePlan[] }> {
  "use cache";
  cacheLife("days");
  const counties = await getJson<{ counties?: County[] }>(SOURCE, `${BASE}/counties/by/zip/${encodeURIComponent(zip)}?${key()}`);
  const c = counties.counties?.[0];
  if (!c) return { county: "", state: "", plans: [] };
  const search = await getJson<{ plans?: RawPlan[] }>(SOURCE, `${BASE}/plans/search?${key()}`, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        household: { income: 52000, people: [{ age: 40, aptc_eligible: true, gender: "Female", uses_tobacco: false }] },
        market: "Individual",
        place: { countyfips: c.fips, state: c.state, zipcode: c.zipcode },
        year,
        limit: 25,
        order: "asc",
        sort: "premium",
      }),
    },
  });
  const plans = search.plans ?? [];
  if (plans.length === 0 || rxcuis.length === 0) return { county: c.name, state: c.state, plans: [] };
  const covered = await getJson<{ coverage?: { plan_id: string; rxcui: string; coverage: MarketplaceCoverage }[] }>(
    SOURCE,
    `${BASE}/drugs/covered?${key()}&year=${year}&drugs=${rxcuis.slice(0, 10).join(",")}&planids=${plans.map((p) => p.id).join(",")}`,
  );
  const rank: Record<MarketplaceCoverage, number> = { Covered: 3, GenericCovered: 2, DataNotProvided: 1, NotCovered: 0 };
  const best = new Map<string, MarketplaceCoverage>();
  for (const r of covered.coverage ?? []) {
    const prev = best.get(r.plan_id);
    if (!prev || rank[r.coverage] > rank[prev]) best.set(r.plan_id, r.coverage);
  }
  return {
    county: c.name,
    state: c.state,
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      issuer: p.issuer?.name ?? "",
      metal: p.metal_level ?? "",
      type: p.type ?? "",
      premium: p.premium,
      coverage: best.get(p.id) ?? "DataNotProvided",
      drugCosts: DRUG_TIERS.flatMap((tier) => {
        const text = inNetwork(p.benefits?.find((b) => b.name === tier)?.cost_sharings);
        return text ? [{ tier: tier.replace(/ Drugs$/, ""), text }] : [];
      }),
    })),
  };
}
