import { describe, expect, it } from "vitest";
import { abbreviationSynonyms } from "../condition-synonyms";
import { assessLabelStatus } from "../label-status";
import { isAboutCondition } from "../study-features";
import { lastSentences } from "../ai-summary";
import { toDrugLabel } from "../sources/openfda";
import { demoLabel } from "../demo/responses";

describe("condition abbreviations", () => {
  it("expands common abbreviations regardless of case and punctuation", () => {
    expect(abbreviationSynonyms("T2DM")).toContain("type 2 diabetes mellitus");
    expect(abbreviationSynonyms(" pcos ")).toEqual(["polycystic ovary syndrome", "polycystic ovarian syndrome"]);
    expect(abbreviationSynonyms("rheumatoid arthritis")).toEqual([]);
  });

  it("lets the label check and the indirectness check recognise T2DM", () => {
    const label = toDrugLabel(demoLabel)!;
    expect(assessLabelStatus(label, "T2DM", abbreviationSynonyms("T2DM")).kind).toBe("approved");
    const study = { title: "Metformin in patients with type 2 diabetes", mesh: [] };
    expect(isAboutCondition(study, ["T2DM", ...abbreviationSynonyms("T2DM")])).toBe(true);
  });
});

it("drops journal boilerplate from extractive findings", () => {
  const abstract = "Weight fell by 12%. Semaglutide was well tolerated. NO LEVEL ASSIGNED: This journal requires that authors assign a level of evidence.";
  expect(lastSentences(abstract, 2)).toBe("Weight fell by 12%. Semaglutide was well tolerated.");
});
