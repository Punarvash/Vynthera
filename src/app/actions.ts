"use server";

import { cleanCondition, cleanDrugName, getMoreStudies, PAGE_SIZE } from "@/lib/evidence";
import type { Article } from "@/lib/types";

/** The next page of PubMed studies for "Load more" on the Evidence tab. */
export async function loadMoreStudies(drug: string, condition: string | undefined, offset: number): Promise<Article[]> {
  const page = Math.max(0, Math.min(Math.floor(offset / PAGE_SIZE), 25));
  return getMoreStudies(cleanDrugName(drug), cleanCondition(condition), page * PAGE_SIZE);
}
