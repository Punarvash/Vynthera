// Loads real pages from a running server and reports what each tab shows.
// Usage: node scripts/smoke-test.ts http://localhost:3000
const base = process.argv[2] ?? "http://localhost:3000";

const pages: [string, string][] = [
  ["search: condition", "/search?q=polycystic+ovary+syndrome"],
  ["search: mechanism", "/search?q=GLP-1+receptor+agonist"],
  ["search: drug name stays on results", "/search?q=amoxicillin"],
  ["search: typo", "/search?q=amoxacilin"],
  ["search: condition typo", "/search?q=strep+thorat"],
  ["suggest: typo", "/api/suggest?q=albutorol"],
  ["suggest: condition", "/api/suggest?q=diabetis&kind=condition"],
  ["evidence", "/drug/metformin?condition=polycystic+ovary+syndrome&tab=evidence"],
  ["cases", "/drug/metformin?condition=polycystic+ovary+syndrome&tab=cases"],
  ["manufacturer", "/drug/metformin?tab=manufacturer"],
  ["costs", "/drug/metformin?tab=costs"],
  ["specialists", "/drug/metformin?tab=specialists&state=TX&city=Houston"],
  ["specialists: condition + ZIP", "/drug/metformin?condition=polycystic+ovary+syndrome&tab=specialists&zip=77030"],
  ["specialists: clinic-given drug", "/drug/infliximab?tab=specialists&state=RI"],
  ["specialists: nationwide", "/drug/amoxicillin?condition=strep+throat&tab=specialists"],
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
  ["patient: medication guide", "/drug/semaglutide?tab=patient"],
  ["patient: biologic guide", "/drug/adalimumab?condition=rheumatoid+arthritis&tab=patient"],
  ["costs: negotiated brand", "/drug/apixaban?tab=costs"],
  ["costs: clinic-given biologic", "/drug/infliximab?tab=costs"],
  ["costs: biologic with biosimilars", "/drug/adalimumab?tab=costs"],
  ["costs: 2027 negotiated", "/drug/semaglutide?tab=costs"],
  ["one box: drug for condition", "/search?q=metformin+for+pcos"],
  ["one box: drug condition", "/search?q=atorvastatin+high+cholesterol"],
  ["approval: consumer name", "/drug/atorvastatin?condition=high+cholesterol&tab=evidence"],
  ["approval: brand label use", "/drug/semaglutide?condition=chronic+weight+management&tab=evidence"],
  ["approval: generic label", "/drug/sildenafil?condition=pulmonary+arterial+hypertension&tab=evidence"],
  ["niche: pirfenidone", "/drug/pirfenidone?condition=idiopathic+pulmonary+fibrosis&tab=evidence"],
  ["niche: dupilumab", "/drug/dupilumab?condition=atopic+dermatitis&tab=patient"],
  ["niche: riboflavin costs", "/drug/riboflavin?tab=costs"],
  ["mid: lamotrigine", "/drug/lamotrigine?condition=bipolar+disorder&tab=evidence"],
  ["mid: spironolactone acne", "/drug/spironolactone?condition=acne&tab=evidence"],
  ["specialists: authors + directory", "/drug/adalimumab?condition=rheumatoid+arthritis&tab=specialists&zip=77030"],
];

/** The same drug by generic, brand and salt name must give the same page (apart from the "you searched" note). */
const samePage: [string, string][] = [
  ["/drug/metformin?tab=costs", "/drug/Glucophage?tab=costs"],
  ["/drug/metformin?tab=costs", "/drug/metformin%20hydrochloride?tab=costs"],
  ["/drug/atorvastatin?condition=high+cholesterol&tab=evidence", "/drug/Lipitor?condition=high+cholesterol&tab=evidence"],
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
  let res: Response;
  let html: string;
  try {
    res = await fetch(base + path, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
    html = await res.text();
  } catch (err) {
    // A page that never finishes is a failure, but keep checking the others.
    failed = true;
    console.log(`\n=== ${name} (no response after ${Math.round(performance.now() - started)} ms) ${path}\n!! ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
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
  console.log(body.slice(body.indexOf("Skip to content") + 15).slice(0, /tab=(costs|specialists|patient)/.test(path) ? 14000 : 5000));
  // The patient view follows the physician view in the page; show it too.
  if (path.includes("tab=patient")) console.log(`--- patient view ---\n${body.slice(body.indexOf("How to take it") - 1500).slice(0, 6000)}`);
}
// The drug page's sentences, sorted (streamed sections can arrive in any order), without the line saying which
// name was searched and the loading placeholders.
async function pageText(path: string): Promise<string> {
  const t = text(await (await fetch(base + path, { signal: AbortSignal.timeout(180_000) })).text())
    .replace(/Showing the ingredient for “[^”]*”, so every name for this drug gives the same results\./, "")
    .replace(/[A-Z][a-z]+ing [^.…]*…/g, "");
  return t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean).sort().join("\n");
}
for (const [a, b] of samePage) {
  try {
    const [ta, tb] = await Promise.all([pageText(a), pageText(b)]);
    const same = ta === tb;
    if (!same) failed = true;
    console.log(`\n=== same page: ${a} vs ${b}: ${same ? "SAME" : "DIFFERENT"}`);
    if (!same) {
      const sa = new Set(ta.split("\n"));
      const sb = new Set(tb.split("\n"));
      console.log(`only in first:\n  ${[...sa].filter((x) => !sb.has(x)).slice(0, 8).join("\n  ")}\nonly in second:\n  ${[...sb].filter((x) => !sa.has(x)).slice(0, 8).join("\n  ")}`);
    }
  } catch (err) {
    failed = true;
    console.log(`\n=== same page: ${a} vs ${b}: ERROR ${err instanceof Error ? err.message : String(err)}`);
  }
}
if (failed) process.exitCode = 1;
export {};
