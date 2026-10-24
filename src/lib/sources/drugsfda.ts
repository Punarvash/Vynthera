import { cacheLife } from "next/cache";
import { getJson } from "../http";
import { compactDateToIso } from "../text";

// openFDA Drugs@FDA API: https://open.fda.gov/apis/drug/drugsfda/
// One record per FDA application, with its holder (sponsor) and products.
const BASE = "https://api.fda.gov/drug/drugsfda.json";
const SOURCE = "openFDA (Drugs@FDA)";

interface RawApplication {
  application_number?: string;
  sponsor_name?: string;
  products?: {
    brand_name?: string;
    marketing_status?: string;
    dosage_form?: string;
    route?: string;
    active_ingredients?: { name?: string; strength?: string }[];
  }[];
  submissions?: { submission_type?: string; submission_status?: string; submission_status_date?: string }[];
}

export type ApplicationType = "NDA" | "ANDA" | "BLA" | "OTHER";

export interface Application {
  number: string;
  type: ApplicationType;
  sponsor: string;
  brandNames: string[];
  forms: string[];
  activeProducts: number;
  totalProducts: number;
  /** Active ingredient names of each product, to tell single-ingredient products from combinations. */
  ingredients: string[][];
  /** ISO date of the original approval, when listed. */
  approvedOn?: string;
  url: string;
}

export function toApplication(raw: RawApplication): Application | null {
  const number = raw.application_number;
  if (!number || !raw.sponsor_name) return null;
  const type = (["NDA", "ANDA", "BLA"].find((t) => number.startsWith(t)) ?? "OTHER") as ApplicationType;
  const products = raw.products ?? [];
  const original = (raw.submissions ?? []).find((s) => s.submission_type === "ORIG" && s.submission_status === "AP");
  return {
    number,
    type,
    sponsor: raw.sponsor_name,
    brandNames: [...new Set(products.map((p) => p.brand_name ?? "").filter(Boolean))],
    forms: [...new Set(products.map((p) => [p.dosage_form, p.route].filter(Boolean).join(", ").toLowerCase()).filter(Boolean))],
    activeProducts: products.filter((p) => p.marketing_status && !/discontinued|none/i.test(p.marketing_status)).length,
    totalProducts: products.length,
    ingredients: products.map((p) => (p.active_ingredients ?? []).map((i) => (i.name ?? "").toLowerCase()).filter(Boolean)),
    approvedOn: compactDateToIso(original?.submission_status_date),
    url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${number.replace(/\D/g, "")}`,
  };
}

/** All FDA applications (brand and generic) whose products contain this ingredient. */
export async function applicationsForDrug(names: string[]): Promise<Application[]> {
  "use cache";
  cacheLife("days");
  const key = process.env.OPENFDA_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENFDA_API_KEY)}` : "";
  const clauses = names.flatMap((n) => {
    const q = encodeURIComponent(`"${n.replace(/"/g, "").toUpperCase()}"`);
    return [`openfda.generic_name:${q}`, `products.active_ingredients.name:${q}`];
  });
  const page = (skip: number) =>
    getJson<{ meta?: { results?: { total?: number } }; results?: RawApplication[] }>(
      SOURCE,
      `${BASE}?search=${clauses.join("+")}&limit=100&skip=${skip}${key}`,
      { notFoundAs: {} },
    );
  // Old, widely made drugs (amoxicillin, metformin) have hundreds of applications; read up to 400.
  const first = await page(0);
  const total = Math.min(first.meta?.results?.total ?? 0, 400);
  // Later pages are extra detail: a rate-limit error there keeps the first page instead of failing the tab.
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, i) => page((i + 1) * 100).catch(() => ({ results: [] }))),
  );
  return [first, ...rest]
    .flatMap((d) => d.results ?? [])
    .map(toApplication)
    .filter((a): a is Application => a !== null);
}
