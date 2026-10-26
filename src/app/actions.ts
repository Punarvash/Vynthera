"use server";

import { cleanCondition, cleanDrugName, getMoreStudies, PAGE_SIZE } from "@/lib/evidence";
import type { Article } from "@/lib/types";
import { getCostBundle } from "@/lib/costs";
import { getCostDetails } from "@/lib/cost-details";
import { marketplaceEnabled, marketplacePlans, type MarketplacePlan } from "@/lib/sources/marketplace";

/** The next page of PubMed studies for "Load more" on the Evidence tab. */
export async function loadMoreStudies(drug: string, condition: string | undefined, offset: number): Promise<Article[]> {
  const page = Math.max(0, Math.min(Math.floor(offset / PAGE_SIZE), 25));
  return getMoreStudies(cleanDrugName(drug), cleanCondition(condition), page * PAGE_SIZE);
}

export interface MarketplaceResult {
  county: string;
  state: string;
  plans: MarketplacePlan[];
  error?: string;
}

/** ACA Marketplace plans in a ZIP code and whether each covers the drug. */
export async function lookupMarketplace(drug: string, zip: string): Promise<MarketplaceResult> {
  const z = zip.replace(/\D/g, "").slice(0, 5);
  if (z.length !== 5) return { county: "", state: "", plans: [], error: "Enter a 5-digit ZIP code." };
  if (!marketplaceEnabled()) return { county: "", state: "", plans: [], error: "Marketplace plan lookup is not available right now." };
  try {
    const { rxcuis } = await getCostDetails(await getCostBundle(cleanDrugName(drug)));
    return await marketplacePlans(z, rxcuis, new Date().getFullYear());
  } catch (err) {
    console.error("Marketplace lookup failed", err);
    return { county: "", state: "", plans: [], error: "HealthCare.gov is not responding right now. Try again later." };
  }
}
