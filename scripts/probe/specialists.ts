// One-off probe of the public data behind the Specialists tab (run in GitHub Actions).
const UA = { "User-Agent": "Vynthera data probe" };
const meta = JSON.parse(await (await import("node:fs/promises")).readFile("data/costs/meta.json", "utf8"));
const api: string = meta.prescribers.apiUrl;

async function show(label: string, url: string, pick?: (j: unknown) => unknown) {
  try {
    const t0 = Date.now();
    const res = await fetch(url, { headers: UA });
    const text = await res.text();
    let out: unknown = text.slice(0, 600);
    try {
      const j = JSON.parse(text);
      out = pick ? pick(j) : JSON.stringify(j).slice(0, 900);
    } catch {}
    console.log(`\n### ${label} [${res.status}, ${Date.now() - t0} ms]\n${url}\n${typeof out === "string" ? out : JSON.stringify(out)}`);
  } catch (e) {
    console.log(`\n### ${label} FAILED ${e}`);
  }
}
const claims = (j: unknown) => Array.isArray(j) ? `${j.length} rows; claims: ${j.slice(0, 8).map((r: Record<string, string>) => `${r.Prscrbr_Last_Org_Name}:${r.Tot_Clms}:${r.Prscrbr_Type}`).join(", ")}` : JSON.stringify(j).slice(0, 400);

await show("prescribers default", `${api}?filter[Gnrc_Name]=Metformin HCl&filter[Prscrbr_State_Abrvtn]=TX&size=8`, claims);
for (const s of ["sort=-Tot_Clms", "sort[Tot_Clms]=DESC", "sort=Tot_Clms&direction=desc", "sort[0][property]=Tot_Clms&sort[0][order]=desc"]) {
  await show(`sort ${s}`, `${api}?filter[Gnrc_Name]=Metformin HCl&filter[Prscrbr_State_Abrvtn]=TX&size=8&${s}`, claims);
}
await show("nationwide no state", `${api}?filter[Gnrc_Name]=Adalimumab&size=8`, claims);
await show("stats count", `${api}/stats?filter[Gnrc_Name]=Metformin HCl&filter[Prscrbr_State_Abrvtn]=TX`);
await show("IN filter", `${api}?filter[g1][condition][path]=Gnrc_Name&filter[g1][condition][operator]=IN&filter[g1][condition][value][1]=Metformin HCl&filter[g1][condition][value][2]=Glipizide&filter[Prscrbr_State_Abrvtn]=RI&size=5`, claims);
await show("keyword", `${api}?keyword=Endocrinology&filter[Gnrc_Name]=Metformin HCl&filter[Prscrbr_State_Abrvtn]=RI&size=5`, claims);
await show("Prscrbr types sample", `${api}?filter[Prscrbr_State_Abrvtn]=RI&filter[Gnrc_Name]=Amoxicillin&size=200`, (j) => Array.isArray(j) ? [...new Set(j.map((r: Record<string, string>) => r.Prscrbr_Type))] : j);

// Catalog: Part B provider-service dataset
const cms = await (await fetch("https://data.cms.gov/data.json", { headers: UA })).json();
for (const d of cms.dataset) {
  if (/Physician & Other Practitioners - by Provider and Service|Physician & Other Practitioners - by Provider\b/i.test(d.title)) {
    const apiDist = d.distribution.filter((x: { accessURL?: string }) => /data-api/.test(x.accessURL ?? "")).slice(-1)[0];
    console.log(`\n* ${d.title} -> ${apiDist?.accessURL} ${apiDist?.title}`);
  }
}
const pb = cms.dataset.filter((d: { title: string }) => /Physician & Other Practitioners - by Provider and Service/i.test(d.title)).flatMap((d: { distribution: { accessURL?: string; title?: string }[] }) => d.distribution).filter((x: { accessURL?: string }) => /data-api\/v1\/dataset\/[^/]+\/data$/.test(x.accessURL ?? ""));
const pbUrl = pb.sort((a: { title?: string }, b: { title?: string }) => String(a.title).localeCompare(String(b.title))).pop()?.accessURL;
if (pbUrl) {
  await show("Part B provider service J1745 RI", `${pbUrl}?filter[HCPCS_Cd]=J1745&filter[Rndrng_Prvdr_State_Abrvtn]=RI&size=5`);
}

// Doctors and Clinicians (provider data catalog)
await show("DAC metastore", "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/mj5m-pzi6", (j: any) => ({ title: j.title, modified: j.modified }));
await show("DAC by NPI", "https://data.cms.gov/provider-data/api/1/datastore/query/mj5m-pzi6/0?conditions[0][property]=npi&conditions[0][value]=1285660241&limit=2");
await show("Facility affiliations by NPI", "https://data.cms.gov/provider-data/api/1/datastore/query/27ea-46a8/0?conditions[0][property]=npi&conditions[0][value]=1285660241&limit=3");

// ClinicalTrials.gov location contacts
await show("CT.gov recruiting with contacts", "https://clinicaltrials.gov/api/v2/studies?query.cond=polycystic+ovary+syndrome&query.intr=metformin&filter.overallStatus=RECRUITING&pageSize=3&fields=NCTId,BriefTitle,ContactsLocationsModule", (j: any) => JSON.stringify(j).slice(0, 2500));

// NPPES taxonomy search + phone/fax
await show("NPPES taxonomy", "https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Endocrinology&state=RI&limit=2", (j: any) => JSON.stringify(j).slice(0, 1500));
