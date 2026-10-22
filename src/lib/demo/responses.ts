// Placeholder API responses for VYNTHERA_DEMO_DATA=1 and unit tests.
// They mimic each public API's response shape so the interface can be exercised offline.
// Titles and text are deliberately marked as demo content: they are NOT real studies.

export const demoLabel = {
  set_id: "demo-set-id-0001",
  effective_time: "20250115",
  indications_and_usage: [
    "1 INDICATIONS AND USAGE Metformin hydrochloride tablets are indicated as an adjunct to diet and exercise to improve glycemic control in adults and pediatric patients 10 years of age and older with type 2 diabetes mellitus. Limitations of Use: not for use in type 1 diabetes mellitus.",
  ],
  mechanism_of_action: [
    "12.1 Mechanism of Action Metformin decreases hepatic glucose production, decreases intestinal absorption of glucose, and improves insulin sensitivity by increasing peripheral glucose uptake and utilization.",
  ],
  nonclinical_toxicology: ["13 NONCLINICAL TOXICOLOGY Placeholder animal toxicity text for interface testing."],
  dosage_and_administration: ["2 DOSAGE AND ADMINISTRATION Placeholder dosage text for interface testing."],
  adverse_reactions: ["6 ADVERSE REACTIONS Placeholder adverse reactions text for interface testing."],
  adverse_reactions_table: [
    "<table><caption>Table 1 (demo placeholder)</caption><thead><tr><th>Reaction</th><th>Drug (%)</th><th>Placebo (%)</th></tr></thead><tbody><tr><td>Demo reaction A</td><td>10</td><td>5</td></tr><tr><td>Demo reaction B</td><td>6</td><td>2</td></tr></tbody></table>",
  ],
  boxed_warning: ["WARNING: PLACEHOLDER BOXED WARNING TEXT FOR INTERFACE TESTING."],
  warnings_and_cautions: ["5 WARNINGS AND PRECAUTIONS Placeholder warnings text."],
  contraindications: ["4 CONTRAINDICATIONS Placeholder contraindications text."],
  openfda: {
    generic_name: ["METFORMIN HYDROCHLORIDE"],
    brand_name: ["GLUCOPHAGE"],
    manufacturer_name: ["Demo Pharmaceuticals Inc."],
    pharm_class_moa: [],
    pharm_class_epc: ["Biguanide [EPC]"],
    route: ["ORAL"],
    rxcui: ["000001"],
    application_number: ["NDA000001"],
  },
};

function demoArticle(pmid: string, title: string, pubType: string, opts: { grant?: string; nct?: string; conclusion: string }) {
  return `<PubmedArticle><MedlineCitation Status="MEDLINE"><PMID Version="1">${pmid}</PMID><Article>
<Journal><Title>Demo Journal of Medicine</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
<ArticleTitle>[DEMO] ${title}</ArticleTitle>
<Abstract><AbstractText Label="BACKGROUND">Placeholder background text for interface testing.</AbstractText><AbstractText Label="CONCLUSIONS">${opts.conclusion}</AbstractText></Abstract>
<AuthorList><Author><LastName>Placeholder</LastName><Initials>A</Initials></Author><Author><LastName>Example</LastName><Initials>B</Initials></Author></AuthorList>
${opts.grant ? `<GrantList><Grant><Agency>${opts.grant}</Agency><Country>United States</Country></Grant></GrantList>` : ""}
<PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType><PublicationType>${pubType}</PublicationType></PublicationTypeList>
${opts.nct ? `<DataBankList><DataBank><DataBankName>ClinicalTrials.gov</DataBankName><AccessionNumberList><AccessionNumber>${opts.nct}</AccessionNumber></AccessionNumberList></DataBank></DataBankList>` : ""}
</Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId><ArticleId IdType="doi">10.0000/demo.${pmid}</ArticleId></ArticleIdList></PubmedData></PubmedArticle>`;
}

export const demoPubMedXml = `<?xml version="1.0" ?><PubmedArticleSet>
${demoArticle("90000001", "Placeholder meta-analysis of <i>metformin</i> trials", "Meta-Analysis", { grant: "NIDDK NIH HHS", conclusion: "Placeholder conclusion: demo pooled estimate favoured the drug." })}
${demoArticle("90000002", "Placeholder randomized trial", "Randomized Controlled Trial", { nct: "NCT90000002", conclusion: "Placeholder conclusion: demo primary outcome improved versus placebo." })}
${demoArticle("90000003", "Placeholder cohort study", "Observational Study", { conclusion: "Placeholder conclusion: demo association observed." })}
${demoArticle("90000004", "Placeholder case report", "Case Reports", { conclusion: "Placeholder conclusion: demo single-patient outcome." })}
</PubmedArticleSet>`;

const demoStudy = (nctId: string, sponsor: string, cls: string, status: string) => ({
  hasResults: status === "COMPLETED",
  protocolSection: {
    identificationModule: { nctId, briefTitle: `[DEMO] Placeholder trial ${nctId}` },
    sponsorCollaboratorsModule: { leadSponsor: { name: sponsor, class: cls } },
    statusModule: { overallStatus: status, startDateStruct: { date: "2023-03" } },
    designModule: { phases: ["PHASE3"], studyType: "INTERVENTIONAL", enrollmentInfo: { count: 240 } },
    conditionsModule: { conditions: ["Demo condition"] },
  },
});

const demoTrials = {
  totalCount: 2,
  studies: [
    demoStudy("NCT90000002", "Demo Pharmaceuticals Inc.", "INDUSTRY", "COMPLETED"),
    demoStudy("NCT90000005", "Demo University Hospital", "OTHER", "RECRUITING"),
  ],
};

const demoPreprints = {
  hitCount: 1,
  resultList: {
    result: [
      {
        id: "PPR900001",
        source: "PPR",
        title: "[DEMO] Placeholder randomized trial preprint",
        authorString: "Placeholder A, Example B.",
        pubYear: "2025",
        abstractText: "Placeholder abstract for a randomized controlled trial preprint.",
        bookOrReportDetails: { publisher: "medRxiv" },
      },
    ],
  },
};

const demoApplications = [
  {
    application_number: "NDA000001",
    sponsor_name: "DEMO PHARMACEUTICALS INC",
    products: [{ brand_name: "DEMOBRAND", marketing_status: "Prescription", dosage_form: "TABLET", route: "ORAL", active_ingredients: [{ name: "METFORMIN HYDROCHLORIDE" }] }],
    submissions: [{ submission_type: "ORIG", submission_status: "AP", submission_status_date: "19950303" }],
  },
  {
    application_number: "ANDA000002",
    sponsor_name: "PLACEHOLDER GENERICS USA LLC",
    products: [{ brand_name: "METFORMIN HYDROCHLORIDE", marketing_status: "Prescription", dosage_form: "TABLET", route: "ORAL", active_ingredients: [{ name: "METFORMIN HYDROCHLORIDE" }] }],
    submissions: [{ submission_type: "ORIG", submission_status: "AP", submission_status_date: "20020101" }],
  },
  {
    application_number: "ANDA000003",
    sponsor_name: "EXAMPLE LABS LTD",
    products: [{ brand_name: "METFORMIN HYDROCHLORIDE", marketing_status: "Discontinued", dosage_form: "TABLET", route: "ORAL", active_ingredients: [{ name: "METFORMIN HYDROCHLORIDE" }] }],
  },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function graphql(body: string): Response {
  const { query } = JSON.parse(body) as { query: string };
  if (query.includes("search(")) {
    return json({ data: { search: { hits: [{ id: "CHEMBL1431", entity: "drug", name: "METFORMIN", description: "Demo" }] } } });
  }
  if (query.includes("mechanismsOfAction")) {
    return json({
      data: {
        drug: {
          mechanismsOfAction: {
            rows: [{ mechanismOfAction: "Demo mechanism (placeholder)", actionType: "ACTIVATOR", targets: [{ approvedSymbol: "DEMO1" }] }],
          },
        },
      },
    });
  }
  return json({ data: { disease: null, target: null } });
}

export function demoResponse(url: string, init?: RequestInit): Response {
  const u = new URL(url);
  const isDemoDrug = /metformin|glucophage/i.test(decodeURIComponent(u.search));
  switch (u.hostname) {
    case "api.fda.gov":
      if (u.pathname.includes("drugsfda")) {
        return isDemoDrug ? json({ results: demoApplications }) : json({ error: { code: "NOT_FOUND" } }, 404);
      }
      if (/indications_and_usage|pharm_class/.test(decodeURIComponent(u.search))) return json({ error: { code: "NOT_FOUND" } }, 404);
      return isDemoDrug ? json({ meta: { results: { total: 1 } }, results: [demoLabel] }) : json({ error: { code: "NOT_FOUND" } }, 404);
    case "eutils.ncbi.nlm.nih.gov":
      if (u.pathname.endsWith("esearch.fcgi")) {
        if (!isDemoDrug) return json({ esearchresult: { count: "0", idlist: [] } });
        const cases = decodeURIComponent(u.search).includes("case reports");
        return json({ esearchresult: cases ? { count: "1", idlist: ["90000004"] } : { count: "3", idlist: ["90000001", "90000002", "90000003"] } });
      }
      return new Response(demoPubMedXml, { status: 200, headers: { "Content-Type": "text/xml" } });
    case "www.ebi.ac.uk":
      return json(isDemoDrug ? demoPreprints : { hitCount: 0, resultList: { result: [] } });
    case "clinicaltrials.gov":
      return json(isDemoDrug || u.searchParams.has("filter.ids") ? demoTrials : { totalCount: 0, studies: [] });
    case "connect.medlineplus.gov":
      return json({
        feed: {
          entry: [
            {
              title: { _value: "Demo medicine page (placeholder)" },
              link: [{ href: "https://medlineplus.gov/" }],
              summary: { _value: "<p>Placeholder plain-language summary for interface testing.</p>" },
            },
          ],
        },
      });
    case "data.cms.gov":
      return json([
        { Prscrbr_NPI: "1000000001", Prscrbr_Last_Org_Name: "PLACEHOLDER", Prscrbr_First_Name: "ALEX", Prscrbr_City: "HOUSTON", Prscrbr_State_Abrvtn: "TX", Prscrbr_Type: "Endocrinology", Brnd_Name: "Metformin HCl", Gnrc_Name: "Metformin HCl", Tot_Clms: "420", Tot_Benes: "130" },
        { Prscrbr_NPI: "1000000002", Prscrbr_Last_Org_Name: "EXAMPLE", Prscrbr_First_Name: "SAM", Prscrbr_City: "HOUSTON", Prscrbr_State_Abrvtn: "TX", Prscrbr_Type: "Internal Medicine", Brnd_Name: "Metformin HCl", Gnrc_Name: "Metformin HCl", Tot_Clms: "35", Tot_Benes: "" },
      ]);
    case "npiregistry.cms.hhs.gov": {
      const npi = u.searchParams.get("number") ?? "1000000001";
      return json({
        result_count: 1,
        results: [
          {
            number: npi,
            basic: { first_name: npi.endsWith("1") ? "ALEX" : "SAM", last_name: npi.endsWith("1") ? "PLACEHOLDER" : "EXAMPLE", credential: "M.D." },
            addresses: [{ address_purpose: "LOCATION", address_1: "100 DEMO STREET", city: "HOUSTON", state: "TX", postal_code: "770300000", telephone_number: "555-010-0100" }],
            taxonomies: [{ desc: npi.endsWith("1") ? "Endocrinology, Diabetes & Metabolism" : "Internal Medicine", primary: true }],
          },
        ],
      });
    }
    case "api.platform.opentargets.org":
      return graphql(String(init?.body ?? "{}"));
    default:
      return json({ error: "No demo data for this host" }, 404);
  }
}

export { demoTrials, demoPreprints };
