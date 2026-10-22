import { describe, expect, it } from "vitest";
import { classifyFunding, isIndustryAgency } from "../funding";
import { assessGrade, uncertaintyStatement } from "../grade";
import { assessLabelStatus } from "../label-status";
import { pickDesign, inferDesignFromText } from "../design";
import type { Article, DrugLabel, StudyDesign, Trial } from "../types";

function article(design: StudyDesign, extra: Partial<Article> = {}): Article {
  return {
    id: Math.random().toString(36),
    source: "pubmed",
    peerReviewed: true,
    title: "t",
    journal: "j",
    year: "2024",
    authors: "A",
    abstract: "",
    design,
    designInferred: false,
    url: "https://example.org",
    nctIds: [],
    grantAgencies: [],
    funding: { kind: "unreported", reason: "" },
    ...extra,
  };
}

const label = {
  indications:
    "Metformin is indicated to improve glycemic control in adults with type 2 diabetes mellitus. Limitations of Use: not for type 1 diabetes mellitus or diabetic ketoacidosis.",
} as DrugLabel;

describe("off-label status", () => {
  it("finds an exact phrase in the indications", () => {
    expect(assessLabelStatus(label, "Type 2 Diabetes").kind).toBe("approved");
  });
  it("flags a condition missing from the label as off-label", () => {
    expect(assessLabelStatus(label, "polycystic ovary syndrome").kind).toBe("off-label");
  });
  it("does not treat Limitations of Use as an approval", () => {
    expect(assessLabelStatus(label, "type 1 diabetes").kind).toBe("limitation");
    expect(assessLabelStatus(label, "diabetic ketoacidosis").kind).toBe("limitation");
  });
  it("handles missing inputs", () => {
    expect(assessLabelStatus(null, "x").kind).toBe("no-label");
    expect(assessLabelStatus(label, "  ").kind).toBe("no-condition");
  });
});

describe("GRADE starting certainty", () => {
  it("rates two randomized trials High", () => {
    expect(assessGrade([article("rct"), article("rct")]).level).toBe("high");
  });
  it("downgrades a lone trial for imprecision", () => {
    expect(assessGrade([article("rct"), article("observational")]).level).toBe("moderate");
  });
  it("rates observational evidence Low and case reports Very low", () => {
    expect(assessGrade([article("observational")]).level).toBe("low");
    expect(assessGrade([article("case-report")]).level).toBe("very-low");
  });
  it("ignores preprints when rating", () => {
    const g = assessGrade([article("rct", { peerReviewed: false }), article("case-report")]);
    expect(g.level).toBe("very-low");
    expect(g.rationale.join(" ")).toMatch(/1 preprint not peer reviewed was shown but not counted/);
  });
  it("says when nothing was found, without implying the drug fails", () => {
    const grade = assessGrade([]);
    expect(grade.level).toBe("insufficient");
    const lines = uncertaintyStatement({ drug: "x", condition: "y", grade, articles: [], trials: [], labelStatus: { kind: "off-label" } });
    expect(lines[0]).toMatch(/not that it does not work/);
    expect(lines.at(-1)).toMatch(/off-label/);
  });
});

describe("funding labels", () => {
  const trial = (cls: Trial["sponsorClass"], sponsor: string): Trial => ({
    nctId: "NCT00000001", title: "", sponsor, sponsorClass: cls, status: "COMPLETED", phases: [], studyType: "", hasResults: false, conditions: [], url: "",
  });

  it("uses the linked trial's sponsor first", () => {
    const a = article("rct", { nctIds: ["NCT00000001"], grantAgencies: ["NIH"] });
    const f = classifyFunding(a, new Map([["NCT00000001", trial("INDUSTRY", "Acme Pharma")]]), []);
    expect(f.kind).toBe("industry");
    expect(f.reason).toContain("Acme Pharma");
  });
  it("recognises company grants, including the label manufacturer", () => {
    expect(isIndustryAgency("Novo Nordisk")).toBe(true);
    expect(isIndustryAgency("Contoso Biologics LLC")).toBe(true);
    expect(isIndustryAgency("Zenith", ["Zenith Labs"])).toBe(true);
    expect(isIndustryAgency("NIDDK NIH HHS")).toBe(false);
    expect(isIndustryAgency("Wellcome Trust Ltd")).toBe(false);
  });
  it("calls public grants independent and missing funders unreported", () => {
    expect(classifyFunding(article("rct", { grantAgencies: ["NHLBI NIH HHS"] }), new Map(), []).kind).toBe("independent");
    expect(classifyFunding(article("rct"), new Map(), []).kind).toBe("unreported");
  });
});

describe("study design", () => {
  it("picks the strongest PubMed publication type", () => {
    expect(pickDesign(["Journal Article", "Randomized Controlled Trial", "Meta-Analysis"])).toBe("meta-analysis");
    expect(pickDesign(["Clinical Trial, Phase III"])).toBe("clinical-trial");
    expect(pickDesign(["Journal Article"])).toBe("other");
  });
  it("infers preprint designs from wording", () => {
    expect(inferDesignFromText("A retrospective cohort of 900 patients")).toBe("observational");
    expect(inferDesignFromText("We report a case of refractory disease")).toBe("case-report");
  });
});

describe("off-label word matching", () => {
  it("matches reordered words but not a different number", () => {
    const l = { indications: "Indicated for diabetes mellitus type 2 in adults." } as DrugLabel;
    expect(assessLabelStatus(l, "type 2 diabetes").kind).toBe("likely-approved");
    expect(assessLabelStatus(l, "type 1 diabetes").kind).toBe("off-label");
  });
});
