// Weekly import of public drug cost data into data/costs/: NADAC (with price history), Medicare Part D
// spending and plan coverage, Part B prices and spending, negotiated Medicare prices and VA prices.
// Run: node scripts/costs/import.ts            (downloads the newest datasets)
//      node scripts/costs/import.ts --nadac-file nadac.csv --partd-file partd.csv   (use local CSVs)
// GitHub Actions runs this every week (.github/workflows/import-costs.yml); "Run workflow" refreshes on demand.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CostMeta, NadacFile, NadacHistoryFile, PartDFile } from "../../src/lib/cost-data.ts";
import { NadacHistory } from "./parse-extra.ts";
import { NadacAccumulator, parsePartD, pickApi, pickCsv, pickDataset, toIsoDate } from "./parse.ts";
import { csvRecords, fetchOk } from "./io.ts";
import { importConditionNames, importNegotiated, importPartB, importPartBSpending, importPlanCoverage, importVa } from "./import-extra.ts";

const OUT_DIR = new URL("../../data/costs/", import.meta.url);
const MEDICAID_CATALOG = "https://data.medicaid.gov/api/1/metastore/schemas/dataset/items";
const CMS_CATALOG = "https://data.cms.gov/data.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function importNadac(meta: CostMeta): Promise<void> {
  let url = arg("--nadac-file");
  let title = "NADAC (local file)";
  let previous: { title: string; url: string } | undefined;
  if (!url) {
    const catalog = (await (await fetchOk(MEDICAID_CATALOG)).json()) as Parameters<typeof pickDataset>[0];
    const dataset = pickDataset(catalog, /^NADAC \(National Average Drug Acquisition Cost\)/i);
    const csv = dataset && pickCsv(dataset);
    if (!dataset || !csv?.downloadURL) throw new Error("Could not find the NADAC dataset in the data.medicaid.gov catalog");
    url = csv.downloadURL;
    title = dataset.title ?? title;
    const year = Number(title.match(/\b(20\d{2})\b/)?.[1]);
    const last = year ? pickDataset(catalog, new RegExp(`^NADAC \\(National Average Drug Acquisition Cost\\) ${year - 1}$`, "i")) : undefined;
    const lastCsv = last && pickCsv(last);
    if (last && lastCsv?.downloadURL) previous = { title: last.title ?? "", url: lastCsv.downloadURL };
  }
  console.log(`NADAC: reading ${title} from ${url}`);
  const history = new NadacHistory();
  const acc = new NadacAccumulator();
  acc.onRow = (d, p, a) => history.add(d, p, a);
  let n = 0;
  for await (const fields of csvRecords(url)) {
    if (n++ === 0) acc.setHeader(fields);
    else acc.add(fields);
  }
  const rows = acc.rows();
  if (rows.length < 1000 && !arg("--nadac-file")) throw new Error(`NADAC import looks wrong: only ${rows.length} rows`);
  const file: NadacFile = { datasetTitle: title, sourceUrl: url, asOf: acc.latestAsOf, rows };
  await writeFile(new URL("nadac.json", OUT_DIR), JSON.stringify(file));
  meta.nadac = { title, url, asOf: acc.latestAsOf, rows: rows.length };
  console.log(`NADAC: ${n - 1} records -> ${rows.length} products, as of ${acc.latestAsOf}`);

  // Price history: last year's dataset as well, for two years of monthly prices.
  if (previous) {
    console.log(`NADAC history: reading ${previous.title}`);
    const prev = new NadacAccumulator();
    prev.onRow = (d, p, a) => history.add(d, p, a);
    let m = 0;
    for await (const fields of csvRecords(previous.url)) {
      if (m++ === 0) prev.setHeader(fields);
      else prev.add(fields);
    }
  }
  const h = history.result(new Set(rows.map((r) => r[0])), 24);
  await writeHistory(h);
  meta.nadacHistory = { years: [...new Set(h.months.map((x) => Number(x.slice(0, 4))))], months: h.months.length };
  console.log(`NADAC history: ${Object.keys(h.rows).length} products over ${h.months.length} months`);
}

/** One product per line, so weekly commits change only the lines whose prices changed. */
async function writeHistory(h: NadacHistoryFile): Promise<void> {
  const lines = Object.entries(h.rows).map(([d, v]) => `${JSON.stringify(d)}:${JSON.stringify(v)}`);
  await writeFile(new URL("nadac-history.json", OUT_DIR), `{"months":${JSON.stringify(h.months)},"rows":{\n${lines.join(",\n")}\n}}\n`);
}

async function importCms(meta: CostMeta): Promise<void> {
  let url = arg("--partd-file");
  let title = "Medicare Part D Spending by Drug (local file)";
  if (!url) {
    const catalog = (await (await fetchOk(CMS_CATALOG)).json()) as { dataset?: Parameters<typeof pickDataset>[0] };
    const datasets = catalog.dataset ?? [];
    const partDTitles = datasets.map((d) => d.title ?? "").filter((t) => /part d/i.test(t));
    console.log(`CMS catalog: ${datasets.length} datasets; Part D titles: ${partDTitles.join(" | ")}`);
    // Catalog titles look like "Medicare Part D Spending by Drug : 2024-01-01"; the quarterly file has a different layout.
    const spending = pickDataset(datasets, /^Medicare Part D Spending by Drug\b/i);
    const csv = spending && pickCsv(spending);
    if (spending && !csv) {
      console.log(`Distributions: ${JSON.stringify(spending.distribution?.slice(0, 5))}`);
    }
    if (!spending || !csv?.downloadURL) throw new Error("Could not find Medicare Part D Spending by Drug in the data.cms.gov catalog");
    url = csv.downloadURL;
    title = spending.title ?? title;

    const prescribers = pickDataset(datasets, /^Medicare Part D Prescribers - by Provider and Drug\b/i);
    const api = prescribers && pickApi(prescribers);
    if (prescribers && api?.accessURL) {
      const year = Number((api.title ?? api.temporal ?? "").match(/\b20\d{2}\b/g)?.pop()) || undefined;
      meta.prescribers = { title: prescribers.title ?? "", apiUrl: api.accessURL, year };
      console.log(`Prescribers API: ${api.accessURL} (${year ?? "year unknown"})`);
    } else {
      console.warn("Prescribers dataset API not found; the Specialists tab will show NPI search only.");
    }
    const services = pickDataset(datasets, /^Medicare Physician & Other Practitioners - by Provider and Service\b/i);
    const servicesApi = services && pickApi(services);
    if (services && servicesApi?.accessURL) {
      const year = Number((servicesApi.title ?? servicesApi.temporal ?? "").match(/\b20\d{2}\b/g)?.pop()) || undefined;
      meta.partBProviders = { title: services.title ?? "", apiUrl: servicesApi.accessURL, year };
      console.log(`Part B provider services API: ${servicesApi.accessURL} (${year ?? "year unknown"})`);
    }
  }
  console.log(`Part D: reading ${title} from ${url}`);
  let header: string[] = [];
  const records: string[][] = [];
  for await (const fields of csvRecords(url)) {
    if (header.length === 0) header = fields;
    else records.push(fields);
  }
  const { year, rows } = parsePartD(header, records);
  const file: PartDFile = { datasetTitle: title, sourceUrl: url, year, rows };
  await writeFile(new URL("partd.json", OUT_DIR), JSON.stringify(file));
  meta.partD = { title, url, year, rows: rows.length };
  console.log(`Part D: ${rows.length} drugs for ${year}`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  let meta: CostMeta = { importedAt: "" };
  try {
    meta = JSON.parse(await readFile(new URL("meta.json", OUT_DIR), "utf8")) as CostMeta;
  } catch {
    // First run.
  }
  const failures: string[] = [];
  const local = Boolean(arg("--nadac-file") || arg("--partd-file"));
  let cms: Parameters<typeof importPlanCoverage>[1] = {};
  if (!local) {
    try {
      cms = (await (await fetchOk(CMS_CATALOG)).json()) as typeof cms;
    } catch (err) {
      failures.push(`CMS catalog: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const steps: [string, () => Promise<void>][] = [
    ["NADAC", () => importNadac(meta)],
    ["CMS Part D spending", () => importCms(meta)],
  ];
  if (!local) {
    steps.push(
      ["Medicare plan coverage", () => importPlanCoverage(meta, cms)],
      ["Medicare Part B prices", () => importPartB(meta)],
      ["Medicare Part B spending", () => importPartBSpending(meta, cms)],
      ["Negotiated Medicare prices", () => importNegotiated(meta)],
      ["VA Federal Supply Schedule", () => importVa(meta)],
      ["Search condition names", () => importConditionNames()],
    );
  }
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  meta.importedAt = toIsoDate(new Date().toISOString());
  await writeFile(new URL("meta.json", OUT_DIR), `${JSON.stringify(meta, null, 2)}\n`);
  if (failures.length) {
    // Keep last week's data for a failed source, and fail the run so the problem is visible in GitHub.
    console.error(`Import problems:\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
}

await main();
