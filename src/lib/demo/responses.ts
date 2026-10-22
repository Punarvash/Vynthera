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
  nonclinical_toxicology: ["13 NONCLINICAL TOXICOLOGY (demo text)"],
  openfda: {
    generic_name: ["METFORMIN HYDROCHLORIDE"],
    brand_name: ["GLUCOPHAGE"],
    manufacturer_name: ["Demo Pharmaceuticals Inc."],
    pharm_class_moa: [],
    pharm_class_epc: ["Biguanide [EPC]"],
    route: ["ORAL"],
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
    case "api.platform.opentargets.org":
      return graphql(String(init?.body ?? "{}"));
    default:
      return json({ error: "No demo data for this host" }, 404);
  }
}

export { demoTrials, demoPreprints };
