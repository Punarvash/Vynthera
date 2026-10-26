import { describe, expect, it } from "vitest";
import { assessLabelStatus, labelStatusText } from "../label-status";
import { extractStatedCertainty } from "../study-features";
import { commonSideEffectsFromLabel } from "../patient-info";
import { uniqueGenericNames, toDrugLabel } from "../sources/openfda";
import { assessGrade } from "../grade";
import { conditionClause } from "../sources/pubmed";
import { demoLabel, demoPubMedXml } from "../demo/responses";
import { parsePubMedXml } from "../sources/pubmed";
import type { Article, DrugLabel } from "../types";

const base = toDrugLabel(demoLabel)!;
const amoxicillin: DrugLabel = {
  ...base,
  genericName: "amoxicillin",
  indications:
    "1.1 Infections of the Ear, Nose, and Throat AMOXIL is indicated in the treatment of infections due to susceptible (ONLY β-lactamase–negative) isolates of Streptococcus species (α- and β-hemolytic isolates only), Streptococcus pneumoniae, Staphylococcus spp., or Haemophilus influenzae. 1.2 Infections of the Genitourinary Tract AMOXIL is indicated in the treatment of infections due to susceptible isolates of Escherichia coli. 1.3 Infections of the Skin and Skin Structure 1.4 Infections of the Lower Respiratory Tract 1.5 Helicobacter pylori Infection Triple therapy for Helicobacter pylori with clarithromycin and lansoprazole.",
};

describe("FDA approval check for labels that list body sites", () => {
  it.each(["otitis media", "strep throat", "pharyngitis", "sinusitis", "pneumonia", "UTI", "cystitis", "cellulitis", "H. pylori", "acute otitis media"])(
    "treats amoxicillin for %s as approved",
    (condition) => {
      const s = assessLabelStatus(amoxicillin, condition, []);
      expect(["approved", "likely-approved"]).toContain(s.kind);
    },
  );

  it("explains which category covers the condition", () => {
    const s = assessLabelStatus(amoxicillin, "otitis media", []);
    expect(labelStatusText(s, "amoxicillin", "otitis media")).toMatch(/cover "infections of the ear", which includes otitis media/);
  });

  it("still flags uses the label does not cover", () => {
    expect(assessLabelStatus(amoxicillin, "Lyme disease", []).kind).toBe("off-label");
    expect(assessLabelStatus(amoxicillin, "acne", []).kind).toBe("off-label");
  });
});

describe("GRADE ratings stated by reviews", () => {
  it("reads common phrasings", () => {
    expect(extractStatedCertainty("Metformin may improve live birth (low-quality evidence).")).toEqual(["low"]);
    expect(extractStatedCertainty("moderate-certainty evidence for weight; very low certainty evidence for ovulation")).toEqual(["moderate", "very-low"]);
    expect(extractStatedCertainty("The quality of the evidence was low.")).toEqual(["low"]);
    expect(extractStatedCertainty("The evidence was of moderate quality.")).toEqual(["moderate"]);
  });

  it("ignores calls for better evidence", () => {
    expect(extractStatedCertainty("There is a lack of high-quality evidence. High-quality evidence is needed.")).toEqual([]);
    expect(extractStatedCertainty("Further high quality evidence from large trials is required.")).toEqual([]);
  });

  it("caps the rating at what Cochrane reviewers published", () => {
    const [review] = parsePubMedXml(demoPubMedXml);
    const rated: Article[] = [
      { ...review, title: "Metformin for polycystic ovary syndrome", cochrane: true, aboutDrug: true, statedCertainty: ["low"], sampleSize: 4000 },
      { ...review, id: "x2", design: "rct", title: "Metformin in polycystic ovary syndrome: a trial", blinding: "blinded", aboutDrug: true, sampleSize: 500 },
    ];
    const g = assessGrade({
      condition: "polycystic ovary syndrome",
      counts: { metaAnalyses: 10, rcts: 40, nonRandomized: 0, observational: 0, caseReports: 0 },
      rated,
      conditionPhrases: ["polycystic ovary syndrome"],
      directionsAssessed: false,
    });
    expect(g.level).toBe("low");
    expect(g.published?.[0]).toMatchObject({ cochrane: true, levels: ["low"] });
  });
});

it("lists the label's most common side effects", () => {
  expect(
    commonSideEffectsFromLabel("Most common adverse reactions (>5%) are diarrhea, nausea/vomiting, flatulence, asthenia, indigestion, abdominal discomfort, and headache. (6.1)"),
  ).toEqual(["Diarrhea", "Nausea/vomiting", "Flatulence", "Asthenia", "Indigestion", "Abdominal discomfort", "Headache"]);
  expect(commonSideEffectsFromLabel("No adverse reactions listed.")).toEqual([]);
});

it("folds FDA typos into the common spelling", () => {
  const names = ["clomiphene citrate", "clomiphene citrate", "clomiphene citrtae", "letrozole"].map((genericName) => ({ ...base, genericName }));
  expect(uniqueGenericNames(names)).toEqual(["clomiphene citrate", "letrozole"]);
});

it("searches abbreviations with their full names", () => {
  expect(conditionClause("T2DM")).toContain('"type 2 diabetes mellitus"[tiab]');
});

describe("typo-tolerant matching", async () => {
  const { editDistance, matchScore, normalize } = await import("../suggest");
  const e = (s: string) => ({ norm: normalize(s), words: normalize(s).split(" ") });
  it("counts adjacent swaps as one edit", () => {
    expect(editDistance("metfromin", "metformin")).toBe(1);
    expect(editDistance("albutorol", "albuterol")).toBe(1);
  });
  it("matches prefixes, words and misspellings, not unrelated names", () => {
    expect(matchScore("albut", e("Albuterol"))).toBeGreaterThan(85);
    expect(matchScore("thro", e("Strep throat"))).toBe(85);
    expect(matchScore("amoxacillin", e("Amoxicillin"))).toBeGreaterThan(50);
    expect(matchScore("strep thorat", e("Strep throat"))).toBeGreaterThan(40);
    expect(matchScore("asp", e("Metformin"))).toBe(0);
    expect(matchScore("lisinopril", e("Losartan"))).toBe(0);
  });
});
