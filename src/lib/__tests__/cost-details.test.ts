import { describe, expect, it } from "vitest";
import { negotiatedForDrug, partBForDrug, summarizePlanCoverage } from "../cost-details";
import { estimatePartD } from "../medicare-benefit";
import type { NegotiatedRow, PlanCoverageFile } from "../cost-data";

describe("Medicare standard benefit estimate", () => {
  it("applies the deductible, 25% coinsurance and the yearly cap", () => {
    const cheap = estimatePartD(10, 12);
    expect(cheap.yearlyPatient).toBe(120);
    const brand = estimatePartD(500, 12);
    expect(brand.firstFill).toBe(500);
    expect(brand.laterFill).toBe(125);
    expect(brand.yearlyPatient).toBe(615 + 0.25 * (6000 - 615));
    expect(estimatePartD(5000, 12).yearlyPatient).toBe(2100);
    expect(estimatePartD(400, 12, { insulin: true }).yearlyPatient).toBe(35 * 12);
  });
});

describe("negotiated prices", () => {
  const rows: NegotiatedRow[] = [
    { ipay: 2026, drug: "XARELTO", ingredient: "rivaroxaban", effective: "2026-01-01", end: "2025-12-31", price30Day: 197 },
    { ipay: 2026, drug: "XARELTO", ingredient: "rivaroxaban", effective: "2027-01-01", end: "2026-12-31", price30Day: 202.33 },
    { ipay: 2027, drug: "JANUMET; JANUMET XR", ingredient: "metformin; sitagliptin", effective: "2027-01-01", end: "", price30Day: 80 },
    { ipay: 2026, drug: "ENTRESTO; ENTRESTO SPRINKLE", ingredient: "valsartan / sacubitrilat", effective: "2026-06-01", end: "2026-12-31", price30Day: 295 },
  ];

  it("finds the current and next price, treating impossible end dates as open", () => {
    const r = negotiatedForDrug(rows, "rivaroxaban", ["Xarelto"], "2026-10-26");
    expect(r.current?.price30Day).toBe(197);
    expect(r.next?.price30Day).toBe(202.33);
  });

  it("matches combinations only to the same combination", () => {
    expect(negotiatedForDrug(rows, "metformin hydrochloride", [], "2026-10-26").all).toEqual([]);
    expect(negotiatedForDrug(rows, "metformin", [], "2026-10-26").all).toEqual([]);
    expect(negotiatedForDrug(rows, "sitagliptin and metformin", [], "2026-10-26").next?.price30Day).toBe(80);
    expect(negotiatedForDrug(rows, "sacubitril and valsartan", ["Entresto"], "2026-10-26").current?.price30Day).toBe(295);
  });
});

it("finds Part B codes by name, including biosimilar product names", () => {
  const rows = [
    { hcpcs: "J1745", description: "Infliximab not biosimil 10mg", dosage: "10 MG", limit: 29.9, coinsurance: 0.2, drugNames: ["remicade"] },
    { hcpcs: "Q5103", description: "Injection, inflectra", dosage: "10 MG", limit: 10, coinsurance: 0.2, drugNames: ["inflectra"] },
    { hcpcs: "J1950", description: "Leuprolide acetate /3.75 mg", dosage: "3.75 MG", limit: 200, coinsurance: 0.2, drugNames: ["lupron depot"] },
  ];
  expect(partBForDrug(rows, ["infliximab", "inflectra"]).map((r) => r.hcpcs)).toEqual(["J1745", "Q5103"]);
  expect(partBForDrug(rows, ["metformin"])).toEqual([]);
});

it("summarizes plan coverage across a drug's strengths", () => {
  const file: PlanCoverageFile = {
    year: 2026,
    asOf: "2026-09-16",
    sourceUrl: "x",
    totalPlans: 10,
    insurers: [{ name: "A", plans: 6 }, { name: "B", plans: 4 }],
    states: [{ code: "TX", plans: 10 }],
    drugs: {
      "1": { all: [6, 3, 6, 0, 0, 40, -1, 6, 6, 0], insurers: [[0, 6, 3, 6, 0, 0, 40, -1, 6, 6, 0]], states: [[0, 6]] },
      "2": { all: [4, 3, 0, 0, 0, 45, -1, 4, 4, 0], insurers: [[1, 4, 3, 0, 0, 0, 45, -1, 4, 4, 0]], states: [[0, 4]] },
    },
  };
  const s = summarizePlanCoverage(file, ["1", "2", "missing"])!;
  expect(s.overall).toMatchObject({ covered: 10, plans: 10, priorAuth: 6, medianCopay: 40 });
  expect(s.insurers.map((i) => [i.name, i.covered, i.plans])).toEqual([["A", 6, 6], ["B", 4, 4]]);
  expect(summarizePlanCoverage(file, ["9"])).toBeNull();
});
