// Weekly import of public drug cost data into data/costs/.
// Run: node scripts/costs/import.ts            (downloads the newest datasets)
//      node scripts/costs/import.ts --nadac-file nadac.csv --partd-file partd.csv   (use local CSVs)
// GitHub Actions runs this every week (.github/workflows/import-costs.yml); "Run workflow" refreshes on demand.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import type { CostMeta, NadacFile, PartDFile } from "../../src/lib/cost-data.ts";
import { endsInsideQuotes, NadacAccumulator, parsePartD, pickApi, pickCsv, pickDataset, splitCsvLine, toIsoDate } from "./parse.ts";

const OUT_DIR = new URL("../../data/costs/", import.meta.url);
const MEDICAID_CATALOG = "https://data.medicaid.gov/api/1/metastore/schemas/dataset/items";
const CMS_CATALOG = "https://data.cms.gov/data.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": "Vynthera cost import" } });
  if (!res.ok || !res.body) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res;
}

/** Stream CSV records from a URL or local file, yielding parsed fields per record. */
async function* csvRecords(source: string): AsyncGenerator<string[]> {
  const input = /^https?:/.test(source)
    ? Readable.fromWeb((await fetchOk(source)).body as import("node:stream/web").ReadableStream)
    : createReadStream(source);
  let pending = "";
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    pending = pending ? `${pending}\n${line}` : line;
    if (endsInsideQuotes(pending)) continue;
    if (pending.trim()) yield splitCsvLine(pending);
    pending = "";
  }
}

async function importNadac(meta: CostMeta): Promise<void> {
  let url = arg("--nadac-file");
  let title = "NADAC (local file)";
  if (!url) {
    const catalog = (await (await fetchOk(MEDICAID_CATALOG)).json()) as Parameters<typeof pickDataset>[0];
    const dataset = pickDataset(catalog, /^NADAC \(National Average Drug Acquisition Cost\)/i);
    const csv = dataset && pickCsv(dataset);
    if (!dataset || !csv?.downloadURL) throw new Error("Could not find the NADAC dataset in the data.medicaid.gov catalog");
    url = csv.downloadURL;
    title = dataset.title ?? title;
  }
  console.log(`NADAC: reading ${title} from ${url}`);
  const acc = new NadacAccumulator();
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
  for (const [name, step] of [["NADAC", importNadac], ["CMS", importCms]] as const) {
    try {
      await step(meta);
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
