import { describe, expect, it } from "vitest";
import { extractBlinding, extractSampleSize, isAboutCondition, isAboutDrug, isCochrane } from "../study-features";
import { meshFromTranslation, parsePubMedXml, uninvert } from "../sources/pubmed";
import { parseDisclosures } from "../sources/europepmc";
import { fundingFromStatement } from "../funding";
import { parsePrimaryOutcome, trialOrder } from "../sources/clinicaltrials";
import type { Trial } from "../types";

describe("facts read from abstracts", () => {
  it("finds the largest stated participant count", () => {
    expect(extractSampleSize("We randomized 120 patients; 112 patients completed follow-up.")).toBe(120);
    expect(extractSampleSize("Fourteen trials with 2,310 participants were included.")).toBe(2310);
    expect(extractSampleSize("Adults (n = 480) received 500 mg daily.")).toBe(480);
    expect(extractSampleSize("Metformin 1000 mg twice daily.")).toBeUndefined();
  });
  it("reads masking", () => {
    expect(extractBlinding("A double-blind, placebo-controlled trial")).toBe("blinded");
    expect(extractBlinding("An open-label randomized study")).toBe("open-label");
    expect(extractBlinding("A randomized trial")).toBeUndefined();
  });
  it("recognises Cochrane reviews and main topics", () => {
    expect(isCochrane("The Cochrane database of systematic reviews")).toBe(true);
    expect(isAboutDrug({ title: "Inositol for PCOS", meshMajor: ["metformin"] }, ["metformin"])).toBe(true);
    expect(isAboutDrug({ title: "Inositol for PCOS", meshMajor: ["inositol"] }, ["metformin"])).toBe(false);
    expect(isAboutCondition({ title: "Ovulation outcomes", mesh: ["polycystic ovary syndrome"] }, ["PCOS", "polycystic ovary syndrome"])).toBe(true);
  });
});

describe("PubMed record details", () => {
  const xml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article>
    <Journal><Title>The Cochrane database of systematic reviews</Title><JournalIssue><PubDate><Year>2023</Year></PubDate></JournalIssue></Journal>
    <ArticleTitle>Insulin-sensitising drugs</ArticleTitle>
    <Abstract><AbstractText>We included 41 trials (n = 3,075). Double-blind trials were analysed.</AbstractText></Abstract>
    <PublicationTypeList><PublicationType>Systematic Review</PublicationType></PublicationTypeList></Article>
    <MeshHeadingList>
      <MeshHeading><DescriptorName MajorTopicYN="Y">Metformin</DescriptorName></MeshHeading>
      <MeshHeading><DescriptorName MajorTopicYN="N">Polycystic Ovary Syndrome</DescriptorName><QualifierName MajorTopicYN="Y">drug therapy</QualifierName></MeshHeading>
    </MeshHeadingList></MedlineCitation>
    <PubmedData><ArticleIdList><ArticleId IdType="pmc">PMC123</ArticleId></ArticleIdList></PubmedData></PubmedArticle>
    <PubmedArticle><MedlineCitation><PMID>2</PMID><Article><Journal><Title>J</Title></Journal><ArticleTitle>Withdrawn</ArticleTitle>
    <PublicationTypeList><PublicationType>Retracted Publication</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`;
  const [a, b] = parsePubMedXml(xml);

  it("reads MeSH major topics, PMCID, Cochrane and sample size", () => {
    expect(a.meshMajor).toEqual(["metformin", "polycystic ovary syndrome"]);
    expect(a.mesh).toEqual(["metformin", "polycystic ovary syndrome"]);
    expect(a.pmcid).toBe("PMC123");
    expect(a.cochrane).toBe(true);
    expect(a.sampleSize).toBe(3075);
    expect(a.blinding).toBe("blinded");
  });
  it("flags retracted papers", () => {
    expect(b.retracted).toBe(true);
  });
  it("reads the MeSH headings PubMed mapped a query to", () => {
    expect(meshFromTranslation([
      { from: "T2DM", to: '"diabetes mellitus, type 2"[MeSH Terms] OR ("diabetes"[All Fields] AND "type 2"[All Fields]) OR "t2dm"[All Fields]' },
      { from: "metformin", to: '"metformin"[MeSH Terms] OR "metformin"[All Fields]' },
    ])).toEqual(["diabetes mellitus, type 2", "metformin"]);
    expect(meshFromTranslation(undefined)).toEqual([]);
  });
  it("turns inverted MeSH terms into natural phrases", () => {
    expect(uninvert("Diabetes Mellitus, Type 2")).toBe("type 2 diabetes mellitus");
    expect(uninvert("NIDDM")).toBe("niddm");
  });
});

describe("full-text funding", () => {
  it("reads funding and conflict statements from JATS XML", () => {
    const d = parseDisclosures(`<article><front><funding-group><award-group><funding-source>Novo Nordisk A/S</funding-source></award-group>
      <funding-statement>This study was funded by <b>Novo Nordisk</b>.</funding-statement></funding-group></front>
      <back><fn-group><fn fn-type="conflict"><p>AB has received fees from Novo Nordisk.</p></fn></fn-group></back></article>`);
    expect(d.funding).toBe("This study was funded by Novo Nordisk.");
    expect(d.fundingSources).toEqual(["Novo Nordisk A/S"]);
    expect(d.coi).toMatch(/fees from Novo Nordisk/);
    expect(fundingFromStatement(d, [])?.kind).toBe("industry");
  });
  it("labels unfunded and publicly funded studies independent", () => {
    expect(fundingFromStatement({ funding: "This research received no external funding.", fundingSources: [] }, [])).toEqual({
      kind: "independent",
      reason: "Full text states no external funding",
    });
    expect(fundingFromStatement({ funding: "Supported by grants.", fundingSources: ["National Institutes of Health"] }, [])?.kind).toBe("independent");
    expect(fundingFromStatement({ fundingSources: [] }, [])).toBeNull();
  });
});

describe("ClinicalTrials.gov results", () => {
  it("flattens the first primary outcome", () => {
    const out = parsePrimaryOutcome({
      resultsSection: {
        outcomeMeasuresModule: {
          outcomeMeasures: [
            { type: "SECONDARY", title: "Other" },
            {
              type: "PRIMARY", title: "Change in HbA1c", timeFrame: "24 weeks", unitOfMeasure: "percent",
              groups: [{ id: "OG000", title: "Metformin" }, { id: "OG001", title: "Placebo" }],
              denoms: [{ counts: [{ groupId: "OG000", value: "120" }, { groupId: "OG001", value: "118" }] }],
              classes: [{ categories: [{ measurements: [{ groupId: "OG000", value: "-1.1", spread: "0.2" }, { groupId: "OG001", value: "-0.2", spread: "0.3" }] }] }],
              analyses: [{ pValue: "<0.001" }],
            },
          ],
        },
      },
    });
    expect(out).toEqual({
      title: "Change in HbA1c",
      timeFrame: "24 weeks",
      unit: "percent",
      groups: [
        { title: "Metformin", participants: "120", value: "-1.1 ± 0.2" },
        { title: "Placebo", participants: "118", value: "-0.2 ± 0.3" },
      ],
      pValue: "<0.001",
    });
    expect(parsePrimaryOutcome({})).toBeUndefined();
  });
  it("orders trials with results first", () => {
    const t = (status: string, hasResults: boolean) => ({ status, hasResults }) as Trial;
    expect([t("RECRUITING", false), t("COMPLETED", true), t("COMPLETED", false)].sort((a, b) => trialOrder(a) - trialOrder(b)).map((x) => `${x.status}-${x.hasResults}`)).toEqual([
      "COMPLETED-true",
      "COMPLETED-false",
      "RECRUITING-false",
    ]);
  });
});
