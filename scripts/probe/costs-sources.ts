// One-off discovery of public cost datasets: prints catalog entries, download links, sizes and headers.
// Run in GitHub Actions (probe-costs.yml); the development sandbox cannot reach these hosts.
import { writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Vynthera data probe" };

async function get(url: string, init: RequestInit = {}) {
  try {
    const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) }, redirect: "follow" });
    return res;
  } catch (err) {
    console.log(`  ! ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function size(url: string): Promise<string> {
  const res = await get(url, { method: "HEAD" });
  return res ? `${res.status} ${res.headers.get("content-type") ?? ""} ${res.headers.get("content-length") ?? "?"} bytes` : "failed";
}

function links(html: string, re: RegExp, base: string): string[] {
  return [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), base).href).filter((h) => re.test(h)))];
}

async function page(title: string, url: string, re: RegExp) {
  console.log(`\n### ${title}: ${url}`);
  const res = await get(url);
  if (!res) return [];
  console.log(`  status ${res.status}`);
  const html = await res.text();
  const found = links(html, re, url).slice(0, 25);
  for (const l of found) console.log(`  link ${l}`);
  return found;
}

const urls: Record<string, string> = {};

// 1. data.cms.gov catalog
console.log("### data.cms.gov catalog");
const cms = (await (await get("https://data.cms.gov/data.json"))?.json()) as { dataset?: { title?: string; identifier?: string; distribution?: { title?: string; downloadURL?: string; accessURL?: string; mediaType?: string; format?: string }[] }[] };
for (const d of cms?.dataset ?? []) {
  if (!/formulary|part b spending|part d spending|negotiat|average sales|prescription drug plan|pharmacy network|drug plan/i.test(d.title ?? "")) continue;
  console.log(`\n* ${d.title}`);
  for (const x of (d.distribution ?? []).slice(0, 4)) {
    const u = x.downloadURL ?? x.accessURL;
    console.log(`  - ${x.title ?? ""} | ${x.format ?? x.mediaType ?? ""} | ${u}`);
    if (u && /formulary/i.test(d.title ?? "") && !urls.formulary && x.downloadURL) urls.formulary = x.downloadURL;
    if (u && /part b spending/i.test(d.title ?? "") && !urls.partb && x.downloadURL && /csv/i.test(`${x.format}${x.mediaType}${u}`)) urls.partb = x.downloadURL;
  }
}
if (urls.formulary) console.log(`\nformulary download: ${await size(urls.formulary)}`);

// 2. Part B ASP pricing files
const asp = await page("ASP pricing files", "https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files", /asp|\.zip/i);
for (const l of asp.filter((x) => /\.zip|files\/zip/i.test(x)).slice(0, 3)) console.log(`  ${l}: ${await size(l)}`);

// 3. Negotiated prices
await page("Negotiation program", "https://www.cms.gov/priorities/medicare-prescription-drug-affordability/overview/medicare-drug-price-negotiation-program", /negotiat|fair-price|mfp|fact|\.pdf|\.xlsx|\.csv/i);
await page("Negotiation search", "https://www.cms.gov/search/cms?keys=maximum%20fair%20price", /negotiat|fair|\.pdf|\.xlsx|\.csv/i);

// 4. VA Federal Supply Schedule
const va = await page("VA FSS pharmaceutical prices", "https://www.va.gov/opal/nac/fss/pharmPrices.asp", /\.xlsx?|\.zip|\.csv|pharm/i);
for (const l of va.filter((x) => /\.xlsx?|\.zip|\.csv/i.test(x)).slice(0, 4)) console.log(`  ${l}: ${await size(l)}`);

// 5. Orange Book and Purple Book
console.log(`\n### Orange Book zip: ${await size("https://www.fda.gov/media/76860/download")}`);
await page("Purple Book downloads", "https://purplebooksearch.fda.gov/downloads", /download|\.csv|\.xlsx/i);

// 6. NADAC yearly datasets on data.medicaid.gov
console.log("\n### data.medicaid.gov NADAC datasets");
const mcd = (await (await get("https://data.medicaid.gov/api/1/metastore/schemas/dataset/items"))?.json()) as { title?: string; identifier?: string; distribution?: { identifier?: string; downloadURL?: string }[] }[];
const nadacs = (mcd ?? []).filter((d) => /NADAC|state drug utilization/i.test(d.title ?? ""));
for (const d of nadacs) console.log(`  ${d.title} | ${d.identifier} | dist ${d.distribution?.[0]?.identifier}`);
const first = nadacs.find((d) => /^NADAC \(National/i.test(d.title ?? ""));
if (first?.identifier) {
  const q = `https://data.medicaid.gov/api/1/datastore/query/${first.identifier}/0?limit=2&conditions[0][property]=ndc_description&conditions[0][value]=METFORMIN%25&conditions[0][operator]=LIKE`;
  const r = await get(q);
  console.log(`  datastore sample (${r?.status}): ${(await r?.text())?.slice(0, 1500)}`);
}
const sdud = nadacs.find((d) => /state drug utilization/i.test(d.title ?? ""));
if (sdud?.identifier) {
  const r = await get(`https://data.medicaid.gov/api/1/datastore/query/${sdud.identifier}/0?limit=2`);
  console.log(`  SDUD sample (${r?.status}): ${(await r?.text())?.slice(0, 1500)}`);
}

// 7. Healthcare.gov Marketplace API (needs a key)
const mk = await get("https://marketplace.api.healthcare.gov/api/v1/counties/by/zip/10001");
console.log(`\n### Marketplace API without key: ${mk?.status} ${(await mk?.text())?.slice(0, 300)}`);

await writeFile("probe-urls.json", JSON.stringify(urls));
console.log(`\nurls: ${JSON.stringify(urls)}`);
