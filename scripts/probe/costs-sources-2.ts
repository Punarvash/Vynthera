// Second discovery pass: pages that hold the real download links, and the newest file URLs.
import { writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Vynthera data probe" };
const urls: Record<string, string> = {};

async function text(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    console.log(`  ${res.status} ${url}`);
    return await res.text();
  } catch (err) {
    console.log(`  ! ${url}: ${err instanceof Error ? err.message : err}`);
    return "";
  }
}

function links(html: string, re: RegExp, base: string): string[] {
  return [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), base).href).filter((h) => re.test(h)))];
}

function plain(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

console.log("### Negotiated prices page");
for (const u of [
  "https://www.cms.gov/initiatives/medicare-prescription-drug-affordability/overview/medicare-drug-price-negotiation-program/selected-drugs-negotiated-prices",
  "https://www.cms.gov/newsroom/fact-sheets/medicare-drug-price-negotiation-program-negotiated-prices-initial-price-applicability-year-2026",
]) {
  const html = await text(u);
  const t = plain(html);
  for (const m of t.matchAll(/[^.]{0,160}\$[\d,]+(?:\.\d+)?[^.]{0,120}/g)) console.log(`  > ${m[0].trim()}`);
  for (const l of links(html, /\.pdf|\.xlsx|\.csv|fact-sheet|negotiated-price/i, u).slice(0, 30)) console.log(`  link ${l}`);
}

console.log("\n### VA FSS data page");
const vaUrl = "https://department.va.gov/procurement-acquisition-and-logistics/national-acquisition-center/federal-supply-schedule-service/?target=Data%3A+Pharm+Pricing%2C+Sales+Data%2C+and+Newly+Awarded+Contracts";
const va = await text(vaUrl);
for (const l of links(va, /\.xlsx?|\.zip|\.csv|pharm.*pric|price/i, vaUrl).slice(0, 40)) console.log(`  link ${l}`);
const vaFile = links(va, /\.xlsx?$|\.zip$|\.csv$/i, vaUrl).find((l) => /pharm|fss|price/i.test(l) && !/template|rfm/i.test(l));
if (vaFile) urls.va = vaFile;

console.log("\n### Orange Book data files");
const obUrl = "https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files";
const ob = await text(obUrl);
for (const l of links(ob, /download|\.zip/i, obUrl).slice(0, 20)) console.log(`  link ${l}`);
const obZip = links(ob, /media\/\d+\/download/i, obUrl)[0];
if (obZip) urls.orangeBook = obZip;

console.log("\n### CMS catalog: newest monthly formulary per plan year");
const cms = (await (await fetch("https://data.cms.gov/data.json", { headers: UA })).json()) as { dataset?: { title?: string; distribution?: { downloadURL?: string }[] }[] };
const monthly = (cms.dataset ?? [])
  .filter((d) => /^Monthly Prescription Drug Plan Formulary/i.test(d.title ?? ""))
  .flatMap((d) => (d.distribution ?? []).map((x) => x.downloadURL).filter((u): u is string => Boolean(u)));
for (const u of monthly.slice(-6)) console.log(`  ${u}`);
const thisYear = monthly.filter((u) => /\/2026_\d{8}\.zip$/.test(u)).sort().pop();
if (thisYear) urls.formulary = thisYear;
const partB = (cms.dataset ?? []).find((d) => /^Medicare Part B Spending by Drug/i.test(d.title ?? ""));
const partBCsv = partB?.distribution?.map((x) => x.downloadURL).find((u) => u && /\.csv/i.test(u));
if (partBCsv) urls.partb = partBCsv;

urls.asp = "https://www.cms.gov/files/zip/october-2026-medicare-part-b-payment-limit-files-final.zip";
urls.aspCrosswalk = "https://www.cms.gov/files/zip/october-2026-ndc-hcpcs-crosswalk-final.zip";
urls.purple = "https://www.accessdata.fda.gov/drugsatfda_docs/PurpleBook/2026/purplebook-search-September-data-download.csv";
await writeFile("probe-urls.json", JSON.stringify(urls));
console.log(`\nurls: ${JSON.stringify(urls, null, 2)}`);
