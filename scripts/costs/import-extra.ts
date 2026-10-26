// Weekly imports beyond NADAC and Part D spending: Medicare plan coverage, Part B prices,
// negotiated Medicare prices and VA Federal Supply Schedule prices. Called from import.ts.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CostMeta, NegotiatedFile, PartBFile, PartBSpendingFile, PlanCoverageFile, VaFile } from "../../src/lib/cost-data.ts";
import { collect, csvRecords, download, extract, fetchOk, pipeRecords, zipEntries, zipLines } from "./io.ts";
import { pickCsv, pickDataset, toIsoDate } from "./parse.ts";
import { parseNegotiated, parsePartB, parsePartBSpending, parseSharedStrings, parseVaPrices, sheetRows } from "./parse-extra.ts";
import { CostReader, FormularyReader, PlanReader, summarizeCoverage } from "./parse-formulary.ts";

const OUT_DIR = new URL("../../data/costs/", import.meta.url);
/** Bump when the plan coverage summary logic changes, so the same CMS file is summarized again. */
const PLAN_COVERAGE_VERSION = 2;
type Catalog = { dataset?: { title?: string; modified?: string; distribution?: { title?: string; downloadURL?: string; format?: string; mediaType?: string }[] }[] };

async function save(name: string, data: unknown): Promise<void> {
  await writeFile(new URL(name, OUT_DIR), JSON.stringify(data));
}

/** Links on a CMS or VA web page that match a pattern, newest-looking first as listed. */
async function pageLinks(url: string, re: RegExp): Promise<string[]> {
  const html = await (await fetchOk(url)).text();
  return [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), url).href).filter((h) => re.test(h)))];
}

/** Medicare Part D plan coverage by drug, from CMS's monthly formulary files for the current plan year. */
export async function importPlanCoverage(meta: CostMeta, cms: Catalog): Promise<void> {
  const urls = (cms.dataset ?? [])
    .filter((d) => /^Monthly Prescription Drug Plan Formulary/i.test(d.title ?? ""))
    .flatMap((d) => (d.distribution ?? []).map((x) => x.downloadURL).filter((u): u is string => Boolean(u)));
  // File names start with the plan year ("2026_20260916.zip"); use the newest file for the current year.
  const year = Number(toIsoDate(new Date().toISOString()).slice(0, 4));
  const pick = (y: number) => urls.filter((u) => new RegExp(`/${y}_\\d{8}\\.zip$`).test(u)).sort((a, b) => a.slice(-12).localeCompare(b.slice(-12))).pop();
  const url = pick(year) ?? pick(year - 1);
  if (!url) throw new Error("No monthly Part D formulary file found in the CMS catalog");
  if (meta.planCoverage?.url === url && meta.planCoverage.version === PLAN_COVERAGE_VERSION) {
    console.log(`Plan coverage: ${url} already imported`);
    return;
  }
  console.log(`Plan coverage: downloading ${url}`);
  const zip = await download(url, "formulary.zip");
  const entries = await zipEntries(zip);
  const find = (re: RegExp) => {
    const e = entries.find((x) => re.test(x));
    if (!e) throw new Error(`Formulary zip has no file matching ${re}`);
    return e;
  };
  const inner = async (re: RegExp) => {
    const path = await extract(zip, find(re));
    const files = await zipEntries(path);
    return { path, entry: files[0] };
  };

  const plans = new PlanReader();
  const p = await inner(/plan information/i);
  let first = true;
  for await (const f of pipeRecords(zipLines(p.path, p.entry))) {
    if (first) plans.header(f);
    else plans.add(f);
    first = false;
  }

  const costs = new CostReader();
  const c = await inner(/^beneficiary cost file/i);
  first = true;
  for await (const f of pipeRecords(zipLines(c.path, c.entry))) {
    if (first) costs.header(f);
    else costs.add(f);
    first = false;
  }

  const formulary = new FormularyReader();
  const b = await inner(/basic drugs formulary/i);
  first = true;
  for await (const f of pipeRecords(zipLines(b.path, b.entry))) {
    if (first) formulary.header(f);
    else formulary.add(f);
    first = false;
  }

  const asOf = toIsoDate(`${url.match(/_(\d{4})(\d{2})(\d{2})\.zip$/)?.slice(1, 4).join("-")}`);
  const summary: PlanCoverageFile = summarizeCoverage([...plans.plans.values()], formulary.formularies, costs.costs, {
    year: Number(url.match(/\/(\d{4})_\d{8}\.zip$/)?.[1]) || year,
    asOf,
    sourceUrl: "https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers/monthly-prescription-drug-plan-formulary-and-pharmacy-network-information",
  });
  if (summary.totalPlans < 1000) throw new Error(`Plan coverage looks wrong: only ${summary.totalPlans} plans`);
  await save("plan-coverage.json", summary);
  meta.planCoverage = { url, asOf, plans: summary.totalPlans, version: PLAN_COVERAGE_VERSION };
  console.log(`Plan coverage: ${summary.totalPlans} plans, ${Object.keys(summary.drugs).length} drugs, ${summary.insurers.length} insurer groups`);
}

/** Medicare Part B payment limits (ASP + 6%) for the newest quarter, with product names from the NDC crosswalk. */
export async function importPartB(meta: CostMeta): Promise<void> {
  const links = await pageLinks("https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files", /\.zip$/i);
  const limitUrl = links.find((l) => /payment-limit-files|asp-pricing(-final)?-file/i.test(l) && !/noc|vaccine/i.test(l));
  const crosswalkUrl = links.find((l) => /ndc-hcpcs-crosswalk/i.test(l) && !/seasonal|vaccine/i.test(l));
  if (!limitUrl) throw new Error("No Part B payment limit file linked on the CMS ASP page");
  const limitZip = await download(limitUrl, "asp.zip");
  const limitCsv = (await zipEntries(limitZip)).find((e) => /payment limit file.*\.csv$/i.test(e) || /asp pricing file.*\.csv$/i.test(e));
  if (!limitCsv) throw new Error("Part B zip has no payment limit CSV");
  const limits = await collect(csvRecords(zipLines(limitZip, limitCsv)));
  let crosswalk: string[][] = [];
  if (crosswalkUrl) {
    const cwZip = await download(crosswalkUrl, "crosswalk.zip");
    const cwCsv = (await zipEntries(cwZip)).find((e) => /508.*ASP NDC-HCPCS Crosswalk.*\.csv$/i.test(e));
    if (cwCsv) crosswalk = await collect(csvRecords(zipLines(cwZip, cwCsv)));
  }
  const rows = parsePartB(limits, crosswalk);
  if (rows.length < 200) throw new Error(`Part B import looks wrong: only ${rows.length} codes`);
  const quarter = limits.map((r) => r[0]).find((t) => /^Effective/i.test(t ?? ""))?.replace(/^Effective\s*/i, "") ?? "";
  const file: PartBFile = { quarter, sourceUrl: "https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files", rows };
  await save("partb.json", file);
  meta.partB = { url: limitUrl, quarter, rows: rows.length };
  console.log(`Part B: ${rows.length} billing codes, ${quarter}`);
}

export async function importPartBSpending(meta: CostMeta, cms: Catalog): Promise<void> {
  const d = pickDataset(cms.dataset ?? [], /^Medicare Part B Spending by Drug\b/i);
  const csv = d && pickCsv(d);
  if (!csv?.downloadURL) throw new Error("Medicare Part B Spending by Drug not found in the CMS catalog");
  const records = await collect(csvRecords(csv.downloadURL));
  const { year, rows } = parsePartBSpending(records[0], records.slice(1));
  const file: PartBSpendingFile = { datasetTitle: d?.title ?? "", sourceUrl: csv.downloadURL, year, rows };
  await save("partb-spending.json", file);
  meta.partBSpending = { url: csv.downloadURL, year, rows: rows.length };
  console.log(`Part B spending: ${rows.length} codes for ${year}`);
}

const NEGOTIATION_PAGE =
  "https://www.cms.gov/initiatives/medicare-prescription-drug-affordability/overview/medicare-drug-price-negotiation-program/selected-drugs-negotiated-prices";

export async function importNegotiated(meta: CostMeta): Promise<void> {
  const url = (await pageLinks(NEGOTIATION_PAGE, /\.zip$/i)).find((l) => /negotiated-prices|maximum-fair-price/i.test(l));
  if (!url) throw new Error("No negotiated price data file linked on the CMS page");
  const zip = await download(url, "mfp.zip");
  const entry = (await zipEntries(zip)).find((e) => /\.csv$/i.test(e));
  if (!entry) throw new Error("Negotiated price zip has no CSV");
  const records = await collect(csvRecords(zipLines(zip, entry)));
  const rows = parseNegotiated(records[0], records.slice(1));
  const asOf = toIsoDate(entry.match(/(\d{4})(\d{2})(\d{2})\.csv$/)?.slice(1, 4).join("-"));
  const file: NegotiatedFile = { sourceUrl: NEGOTIATION_PAGE, asOf, rows };
  await save("negotiated.json", file);
  meta.negotiated = { url, asOf, rows: rows.length };
  console.log(`Negotiated prices: ${rows.length} drug price periods, file of ${asOf}`);
}

export async function importVa(meta: CostMeta): Promise<void> {
  const page =
    "https://department.va.gov/procurement-acquisition-and-logistics/national-acquisition-center/federal-supply-schedule-service/?target=Data%3A+Pharm+Pricing%2C+Sales+Data%2C+and+Newly+Awarded+Contracts";
  const links = await pageLinks(page, /PharmPrices[\d-]*\.xlsx$/i);
  const url = links.sort().pop();
  if (!url) throw new Error("No VA pharmaceutical price list linked on the VA page");
  const xlsx = await download(url, "va.xlsx");
  const strings = parseSharedStrings(await readFile(await extract(xlsx, "xl/sharedStrings.xml"), "utf8"));
  const sheet = await readFile(await extract(xlsx, "xl/worksheets/sheet1.xml"), "utf8");
  const asOf = toIsoDate(url.match(/(\d{4}-\d{2}-\d{2})\.xlsx$/)?.[1]) || toIsoDate(new Date().toISOString());
  const rows = parseVaPrices(sheetRows(sheet, strings), asOf);
  if (rows.length < 1000) throw new Error(`VA import looks wrong: only ${rows.length} products`);
  const file: VaFile = { sourceUrl: page, asOf, rows };
  await save("va.json", file);
  meta.va = { url, asOf, rows: rows.length };
  console.log(`VA FSS: ${rows.length} products, prices of ${asOf}`);
}

/** Condition names for search suggestions, from NLM Clinical Tables (consumer and clinical names). */
export async function importConditionNames(): Promise<void> {
  const names = new Set<string>();
  for (const letter of "abcdefghijklmnopqrstuvwxyz") {
    const url = `https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${letter}&maxList=500&df=consumer_name,primary_name`;
    const data = (await (await fetchOk(url)).json()) as [number, string[], unknown, string[][]];
    for (const row of data[3] ?? []) for (const n of row) if (n && n.length < 80) names.add(n.trim());
  }
  if (names.size < 300) throw new Error(`Condition list looks wrong: only ${names.size} names`);
  await mkdir(new URL("../search/", OUT_DIR), { recursive: true });
  await writeFile(new URL("../search/conditions.json", OUT_DIR), `${JSON.stringify({ source: "NLM Clinical Tables (conditions)", names: [...names].sort() })}\n`);
  console.log(`Search: ${names.size} condition names`);
}
