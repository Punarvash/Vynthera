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
  ["synonym check (T2DM)", "/drug/metformin?condition=T2DM&tab=evidence"],
  ["no condition", "/drug/semaglutide?tab=evidence"],
  ["ophthalmic cases", "/search?q=riboflavin&condition=keratoconus"],
  ["ophthalmic cases tab", "/drug/riboflavin?condition=keratoconus&tab=cases"],
  ["antibiotic: otitis media", "/drug/amoxicillin?condition=otitis+media&tab=evidence"],
  ["antibiotic: strep throat", "/drug/amoxicillin?condition=strep+throat&tab=evidence"],
  ["antibiotic: manufacturer", "/drug/amoxicillin?tab=manufacturer"],
  ["antibiotic: patient", "/drug/amoxicillin?condition=sinusitis&tab=patient"],
  ["everyday name", "/drug/atorvastatin?condition=high+cholesterol&tab=evidence"],
  ["off-label check", "/drug/sertraline?condition=premature+ejaculation&tab=evidence"],
  ["costs: negotiated brand", "/drug/apixaban?tab=costs"],
  ["costs: clinic-given biologic", "/drug/infliximab?tab=costs"],
  ["costs: biologic with biosimilars", "/drug/adalimumab?tab=costs"],
  ["costs: 2027 negotiated", "/drug/semaglutide?tab=costs"],
];

function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, " ");
}

let failed = false;
for (const [name, path] of pages) {
  const started = performance.now();
  const res = await fetch(base + path, { redirect: "follow" });
  const html = await res.text();
  const t = text(html);
  const ms = Math.round(performance.now() - started);
  const problems = [...t.matchAll(/(\S+(?: \S+)?) is not responding right now/g)].map((m) => m[1]).join(", ");
  const crash = /Application error|Internal Server Error|This page could not be found/.test(t);
  if (crash || res.status >= 400) failed = true;
  console.log(`\n=== ${name} (${res.status}, ${ms} ms) ${res.url.replace(base, "")}`);
  if (crash) console.log("!! PAGE ERROR");
  if (problems) console.log(`!! Unavailable: ${problems}`);
  // Streamed sections arrive after the footer in the HTML, so drop only the footer text itself.
  const footerStart = t.indexOf("Medical disclaimer.");
  const footerEnd = t.indexOf("pending legal review.");
  const body = footerStart >= 0 && footerEnd > footerStart ? t.slice(0, footerStart) + t.slice(footerEnd + 21) : t;
  console.log(body.slice(body.indexOf("Skip to content") + 15).slice(0, path.includes("tab=costs") ? 12000 : 5000));
}
if (failed) process.exitCode = 1;
export {};
