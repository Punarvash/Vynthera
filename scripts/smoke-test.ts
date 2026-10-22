// Loads real pages from a running server and reports what each tab shows.
// Usage: node scripts/smoke-test.ts http://localhost:3000
const base = process.argv[2] ?? "http://localhost:3000";

const pages: [string, string][] = [
  ["search: condition", "/search?q=polycystic+ovary+syndrome"],
  ["search: mechanism", "/search?q=GLP-1+receptor+agonist"],
  ["evidence", "/drug/metformin?condition=polycystic+ovary+syndrome&tab=evidence"],
  ["cases", "/drug/metformin?condition=polycystic+ovary+syndrome&tab=cases"],
  ["manufacturer", "/drug/metformin?tab=manufacturer"],
  ["costs", "/drug/metformin?tab=costs"],
  ["specialists", "/drug/metformin?tab=specialists&state=TX&city=Houston"],
  ["patient", "/drug/metformin?condition=polycystic+ovary+syndrome&tab=patient"],
  ["biologic", "/drug/adalimumab?tab=evidence"],
];

function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

let failed = false;
for (const [name, path] of pages) {
  const started = performance.now();
  const res = await fetch(base + path, { redirect: "follow" });
  const html = await res.text();
  const t = text(html);
  const ms = Math.round(performance.now() - started);
  const problems = t.match(/Some data sources are unavailable right now(.*?)(try again in a few minutes\.\s*)+/)?.[0] ?? "";
  const crash = /Application error|Internal Server Error|This page could not be found/.test(t);
  if (crash || res.status >= 400) failed = true;
  console.log(`\n=== ${name} (${res.status}, ${ms} ms) ${res.url.replace(base, "")}`);
  if (crash) console.log("!! PAGE ERROR");
  if (problems) console.log(`!! ${problems.slice(0, 600)}`);
  const main = t.slice(t.indexOf("Skip to content") + 15, t.indexOf("Medical disclaimer."));
  console.log(main.slice(0, 2500));
}
if (failed) process.exitCode = 1;
export {};
