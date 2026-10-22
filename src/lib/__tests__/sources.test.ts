import { describe, expect, it } from "vitest";
import { demoLabel, demoPreprints, demoPubMedXml, demoTrials } from "../demo/responses";
import { buildQuery, EVIDENCE_TYPES, parsePubMedXml } from "../sources/pubmed";
import { pickBestLabel, stripSectionHeading, toDrugLabel } from "../sources/openfda";
import { formatPhase, toTrial } from "../sources/clinicaltrials";
import { toPreprint } from "../sources/europepmc";
import type { DrugLabel } from "../types";

describe("PubMed XML parsing", () => {
  const articles = parsePubMedXml(demoPubMedXml);

  it("reads every article with ids, design and links", () => {
    expect(articles.map((a) => a.pmid)).toEqual(["90000001", "90000002", "90000003", "90000004"]);
    expect(articles.map((a) => a.design)).toEqual(["meta-analysis", "rct", "observational", "case-report"]);
    expect(articles[0].url).toBe("https://pubmed.ncbi.nlm.nih.gov/90000001/");
    expect(articles[0].doi).toBe("10.0000/demo.90000001");
  });

  it("strips inline markup from titles and pulls the conclusion section", () => {
    expect(articles[0].title).toBe("[DEMO] Placeholder meta-analysis of metformin trials");
    expect(articles[0].conclusion).toMatch(/^Placeholder conclusion/);
    expect(articles[0].abstract).toMatch(/^BACKGROUND: /);
  });

  it("extracts grant agencies and linked trial registrations", () => {
    expect(articles[0].grantAgencies).toEqual(["NIDDK NIH HHS"]);
    expect(articles[1].nctIds).toEqual(["NCT90000002"]);
  });

  it("handles a single article and an empty set", () => {
    expect(parsePubMedXml("<PubmedArticleSet></PubmedArticleSet>")).toEqual([]);
    const one = demoPubMedXml.replace(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>\s*(?=<PubmedArticle>)/g, "");
    expect(parsePubMedXml(one)).toHaveLength(1);
  });

  it("builds a MEDLINE-only query with drug synonyms and condition", () => {
    const q = buildQuery(["metformin", "glucophage"], "polycystic ovary syndrome", EVIDENCE_TYPES);
    expect(q).toContain('("metformin"[tiab] OR "glucophage"[tiab])');
    expect(q).toContain('"polycystic ovary syndrome"[mh]');
    expect(q).toMatch(/AND medline\[sb\]$/);
  });
});

describe("openFDA labels", () => {
  it("maps a raw label and strips section headings", () => {
    const l = toDrugLabel(demoLabel)!;
    expect(l.genericName).toBe("metformin hydrochloride");
    expect(l.brandNames).toEqual(["Glucophage"]);
    expect(l.indications).toMatch(/^Metformin hydrochloride tablets are indicated/);
    expect(l.mechanism).toMatch(/^Metformin decreases/);
    expect(l.effectiveDate).toBe("2025-01-15");
    expect(l.dailyMedUrl).toContain("setid=demo-set-id-0001");
  });

  it("skips labels without openfda metadata", () => {
    expect(toDrugLabel({ set_id: "x" })).toBeNull();
  });

  it("strips numbered headings", () => {
    expect(stripSectionHeading("1 INDICATIONS & USAGE Drug is indicated", /INDICATIONS\s*(AND|&)\s*USAGE/)).toBe("Drug is indicated");
  });

  it("prefers the exact single-ingredient label", () => {
    const base = toDrugLabel(demoLabel)!;
    const combo: DrugLabel = { ...base, genericName: "metformin and sitagliptin", effectiveDate: "2026-01-01" };
    const exact: DrugLabel = { ...base, genericName: "metformin", mechanism: undefined };
    expect(pickBestLabel([combo, exact], "metformin")?.genericName).toBe("metformin");
  });
});

describe("ClinicalTrials.gov and Europe PMC", () => {
  it("maps studies with sponsor class", () => {
    const t = toTrial(demoTrials.studies[0])!;
    expect(t).toMatchObject({ nctId: "NCT90000002", sponsorClass: "INDUSTRY", hasResults: true, enrollment: 240 });
    expect(t.url).toBe("https://clinicaltrials.gov/study/NCT90000002");
    expect(formatPhase(["PHASE2", "PHASE3"])).toBe("Phase 2/Phase 3");
    expect(formatPhase(["NA"])).toBe("");
  });

  it("marks preprints as not peer reviewed and infers design", () => {
    const p = toPreprint(demoPreprints.resultList.result[0])!;
    expect(p).toMatchObject({ peerReviewed: false, source: "preprint", design: "rct", designInferred: true });
    expect(p.journal).toBe("medRxiv (preprint)");
    expect(p.url).toBe("https://europepmc.org/article/PPR/PPR900001");
  });
});

describe("drug name matching", () => {
  it("treats salt forms and brands as the same drug", async () => {
    const { baseDrugName, namesDrug } = await import("../sources/openfda");
    const l = toDrugLabel(demoLabel)!;
    expect(baseDrugName("METFORMIN HYDROCHLORIDE")).toBe("metformin");
    expect(namesDrug(l, "Metformin")).toBe(true);
    expect(namesDrug(l, "glucophage")).toBe(true);
    expect(namesDrug(l, "metoprolol")).toBe(false);
  });
});

describe("label choice", () => {
  it("prefers the brand holder over repackagers and drops brand names equal to the generic", () => {
    const base = toDrugLabel(demoLabel)!;
    const repack: DrugLabel = { ...base, setId: "r", manufacturer: "RemedyRepack Inc.", applicationNumbers: ["ANDA1"], effectiveDate: "2026-09-01" };
    const generic: DrugLabel = { ...base, setId: "g", manufacturer: "Zydus Pharmaceuticals", applicationNumbers: ["ANDA2"], effectiveDate: "2026-01-01" };
    expect(pickBestLabel([repack, generic], "metformin")?.setId).toBe("g");
    const plain = toDrugLabel({ ...demoLabel, openfda: { ...demoLabel.openfda, brand_name: ["METFORMIN HYDROCHLORIDE"] } })!;
    expect(plain.brandNames).toEqual([]);
  });

  it("decodes entities in label text", () => {
    const l = toDrugLabel({ ...demoLabel, boxed_warning: ["WARNING: lactate levels (&gt;5 mmol/Liter)"] })!;
    expect(l.boxedWarning).toBe("lactate levels (>5 mmol/Liter)");
  });
});
