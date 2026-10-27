import { describeError } from "./http";
import { baseDrugName, getLabel } from "./sources/openfda";
import { ingredientFor, type Ingredient } from "./sources/rxnav";
import type { SourceProblem } from "./types";

// Every route to a drug (typed name, brand, salt form, a condition's drug list) resolves to one RxNorm
// ingredient, so the drug page and every tab work from the same name and give the same results.

export interface DrugIdentity {
  /** Name every tab uses: the RxNorm ingredient for single-ingredient drugs, otherwise the name as given. */
  name: string;
  ingredient: Ingredient | null;
  /** All names for the drug worth searching the literature and price lists with. */
  aliases: string[];
}

/** The name pages and tabs should use for what was typed or linked. */
export function canonicalName(query: string, ingredient: Ingredient | null): string {
  const q = query.trim().toLowerCase();
  // Combination ingredients ("metformin / sitagliptin") are not how FDA labels name products; keep the brand or name given.
  if (!ingredient || ingredient.combination) return q;
  return ingredient.name;
}

export function aliasesFor(name: string, ingredient: Ingredient | null): string[] {
  const all = [name, ...(ingredient?.preciseNames ?? []), ...(ingredient?.brands ?? [])].map((n) => n.toLowerCase().trim()).filter(Boolean);
  return [...new Set(all)];
}

export async function resolveDrug(query: string, problems: SourceProblem[] = []): Promise<DrugIdentity> {
  const q = query.trim();
  let ingredient: Ingredient | null = null;
  try {
    ingredient = await ingredientFor(q);
  } catch (err) {
    problems.push({ source: "RxNorm", message: describeError(err) });
  }
  let name = ingredient ? canonicalName(q, ingredient) : "";
  if (!name) {
    // Without RxNorm: a brand's own FDA label names its ingredient; otherwise drop salt and form words.
    const label = await getLabel(q).catch(() => null);
    name = label && label.brandNames.some((b) => b.toLowerCase() === q.toLowerCase()) && !/ and |,/.test(label.genericName) ? baseDrugName(label.genericName) : baseDrugName(q);
  }
  return { name, ingredient, aliases: aliasesFor(name, ingredient) };
}
