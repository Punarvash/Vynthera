import { describe, expect, it } from "vitest";
import { classifyFunding, isIndustryAgency } from "../funding";
import { assessGrade, uncertaintyStatement, verdict } from "../grade";
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
    meshMajor: [],
    mesh: [],
    cochrane: false,
    aboutDrug: true,
    ...extra,
  };
}

const NONE = { metaAnalyses: 0, rcts: 0, nonRandomized: 0, observational: 0, caseReports: 0 };

function grade(counts: Partial<typeof NONE>, rated: Article[] = [], extra: Partial<Parameters<typeof assessGrade>[0]> = {}) {
  return assessGrade({
    condition: "pcos",
    counts: { ...NONE, ...counts },
    rated,
    conditionPhrases: ["pcos", "polycystic ovary syndrome"],
    directionsAssessed: false,
    ...extra,
  });
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

describe("GRADE certainty", () => {
  const blindedTrial = (n: number, extra: Partial<Article> = {}) =>
    article("rct", { title: "Metformin in polycystic ovary syndrome", sampleSize: n, blinding: "blinded", ...extra });

  it("needs a condition before rating", () => {
    const g = grade({ rcts: 10 }, [], { condition: undefined });
    expect(g.level).toBe("needs-condition");
    expect(g.rationale[0]).toMatch(/10 randomized trials/);
  });

  it("rates large, blinded, consistent randomized evidence High", () => {
    const g = grade({ rcts: 12, metaAnalyses: 3 }, [blindedTrial(300), blindedTrial(250)]);
    expect(g.level).toBe("high");
    expect(g.domains.find((d) => d.name === "Imprecision")?.status).toBe("no-concern");
  });

  it("downgrades a single trial and small evidence for imprecision", () => {
    expect(grade({ rcts: 1 }, [blindedTrial(500)]).level).toBe("moderate");
    const small = grade({ rcts: 3 }, [blindedTrial(60), blindedTrial(80)]);
    expect(small.level).toBe("moderate");
    expect(small.domains.find((d) => d.name === "Imprecision")?.reason).toMatch(/140 participants/);
  });

  it("downgrades mostly open-label trials for risk of bias", () => {
    const g = grade({ rcts: 5 }, [blindedTrial(300, { blinding: "open-label" }), blindedTrial(300, { blinding: "open-label" }), blindedTrial(300)]);
    expect(g.domains.find((d) => d.name === "Risk of bias")?.status).toBe("downgraded");
    expect(g.level).toBe("moderate");
  });

  it("downgrades indirect evidence and industry-dominated funding", () => {
    const industry = { kind: "industry", reason: "x" } as const;
    const g = grade({ rcts: 4 }, [
      blindedTrial(300, { title: "Metformin in obesity", funding: industry }),
      blindedTrial(300, { title: "Metformin in diabetes", funding: industry }),
      blindedTrial(300, { funding: industry }),
    ]);
    const names = g.domains.filter((d) => d.status === "downgraded").map((d) => d.name);
    expect(names).toEqual(["Indirectness", "Publication bias"]);
    expect(g.level).toBe("low");
  });

  it("uses MeSH headings to judge directness", () => {
    const g = grade({ rcts: 4 }, [
      blindedTrial(300, { title: "Effects of metformin on ovulation", mesh: ["polycystic ovary syndrome"] }),
      blindedTrial(300),
    ]);
    expect(g.domains.find((d) => d.name === "Indirectness")?.status).toBe("no-concern");
  });

  it("downgrades inconsistent directions only when AI assessed them", () => {
    const rated = [blindedTrial(300, { direction: "favors" }), blindedTrial(300, { direction: "against" }), blindedTrial(300, { direction: "favors" })];
    expect(grade({ rcts: 3 }, rated).domains.find((d) => d.name === "Inconsistency")?.status).toBe("not-assessed");
    expect(grade({ rcts: 3 }, rated, { directionsAssessed: true }).domains.find((d) => d.name === "Inconsistency")?.status).toBe("downgraded");
  });

  it("starts non-randomized evidence at Low and case reports at Very low", () => {
    expect(grade({ observational: 5 }).level).toBe("low");
    expect(grade({ caseReports: 3 }).level).toBe("very-low");
  });

  it("says when nothing was found, without implying the drug fails", () => {
    const g = grade({});
    expect(g.level).toBe("insufficient");
    const lines = uncertaintyStatement({ drug: "x", condition: "y", grade: g, articles: [], trials: [], labelStatus: { kind: "off-label" } });
    expect(lines[0]).toMatch(/not that it does not work/);
    expect(lines.at(-1)).toMatch(/off-label/);
  });

  it("writes a verdict in GRADE wording", () => {
    expect(verdict("moderate", "metformin", "pcos", { ...NONE, rcts: 3 })).toMatch(/^Moderate certainty evidence on metformin for pcos: probably reliable/);
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

describe("off-label synonyms", () => {
  it("matches MeSH synonyms of the condition", () => {
    const l = { indications: "Adjunct to diet to improve glycemic control in adults with type 2 diabetes mellitus." } as DrugLabel;
    expect(assessLabelStatus(l, "T2DM").kind).toBe("off-label");
    const s = assessLabelStatus(l, "T2DM", ["diabetes mellitus, type 2", "type 2 diabetes mellitus", "niddm"]);
    expect(s).toEqual({ kind: "approved", matched: "type 2 diabetes mellitus" });
  });
});
