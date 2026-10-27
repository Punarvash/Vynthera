import { describe, expect, it } from "vitest";
import { demoLabel } from "../demo/responses";
import { aliasesFor, canonicalName } from "../drug-identity";
import { assessAcrossLabels } from "../label-status";
import { onlyThisDrug, toDrugLabel } from "../sources/openfda";
import { brandsFromProducts, type Ingredient } from "../sources/rxnav";
import { namesFromResponse } from "../sources/condition-names";
import type { DrugLabel } from "../types";

const base = toDrugLabel(demoLabel)!;
const label = (over: Partial<DrugLabel>): DrugLabel => ({ ...base, ...over });
const metformin: Ingredient = { rxcui: "6809", name: "metformin", combination: false, brands: ["Glucophage"], preciseNames: ["metformin hydrochloride"] };

describe("drug identity", () => {
  it("uses the RxNorm ingredient for brands and salts, and keeps combination names as given", () => {
    expect(canonicalName("Glucophage", metformin)).toBe("metformin");
    expect(canonicalName("metformin hydrochloride", metformin)).toBe("metformin");
    expect(canonicalName("Janumet", { ...metformin, name: "metformin / sitagliptin", combination: true })).toBe("janumet");
    expect(aliasesFor("metformin", metformin)).toEqual(["metformin", "metformin hydrochloride", "glucophage"]);
  });

  it("takes brand names only from single-ingredient branded products", () => {
    const names = [
      "24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet [Glumetza]",
      "metformin hydrochloride 500 MG Oral Tablet [Glucophage]",
      "metformin hydrochloride 500 MG / sitagliptin 50 MG Oral Tablet [Janumet]",
    ];
    expect(brandsFromProducts(names, false)).toEqual(["Glucophage", "Glumetza"]);
    expect(brandsFromProducts(names, true)).toContain("Janumet");
  });

  it("keeps only the drug's own labels, not combinations or multivitamins that contain it", () => {
    const own = label({ genericName: "riboflavin 5'-phosphate ophthalmic", setId: "a" });
    const multi = label({ genericName: "thiamine, riboflavin, niacin and pyridoxine", setId: "b" });
    const riboflavin: Ingredient = { rxcui: "9346", name: "riboflavin", combination: false, brands: [], preciseNames: [] };
    expect(onlyThisDrug([multi, own], "riboflavin", riboflavin).map((l) => l.setId)).toEqual(["a"]);
    // Nothing better: keep what there is.
    expect(onlyThisDrug([multi], "riboflavin", riboflavin)).toHaveLength(1);
  });
});

describe("approval across labels", () => {
  it("finds a use the generic label carves out on the brand label", () => {
    const generic = label({ setId: "g", applicationNumbers: ["ANDA111111"], manufacturer: "Generic Co", indications: "Indicated for type 2 diabetes mellitus." });
    const brand = label({
      setId: "b",
      applicationNumbers: ["NDA020357"],
      brandNames: ["Brandname"],
      manufacturer: "Brand Co",
      indications: "Indicated for type 2 diabetes mellitus and for chronic weight management.",
    });
    const status = assessAcrossLabels([generic, brand], "chronic weight management");
    expect(status.kind).toBe("approved");
    expect(status.on?.manufacturer).toBe("Brand Co");
    expect(assessAcrossLabels([generic, brand], "psoriasis")).toMatchObject({ kind: "off-label", checked: 2 });
  });

  it("matches a consumer condition name through its clinical synonyms", () => {
    const statin = label({ indications: "Indicated as an adjunct to diet to reduce LDL-C in adults with primary hyperlipidemia." });
    expect(assessAcrossLabels([statin], "high cholesterol").kind).toBe("off-label");
    expect(assessAcrossLabels([statin], "high cholesterol", ["hypercholesterolemia", "hyperlipidemia"]).kind).toBe("approved");
  });
});

describe("condition names", () => {
  const data: Parameters<typeof namesFromResponse>[1] = [
    2,
    ["1", "2"],
    { primary_name: ["Hypercholesterolemia", "Familial hypercholesterolemia"], synonyms: [["Hyperlipidemia", "High blood cholesterol"], []] },
    [["High cholesterol"], ["Familial hypercholesterolemia"]],
  ];
  it("returns the clinical name and synonyms of the matching condition", () => {
    expect(namesFromResponse("high cholesterol", data)).toEqual(["hypercholesterolemia", "hyperlipidemia", "high blood cholesterol"]);
  });
  it("ignores a hit that does not contain the words typed", () => {
    expect(namesFromResponse("gout", data)).toEqual([]);
  });
});
