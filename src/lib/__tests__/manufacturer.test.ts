import { describe, expect, it } from "vitest";
import { companyCore, displayCompany, groupByCompany, sameCompany } from "../manufacturer";
import { toApplication } from "../sources/drugsfda";

describe("company names", () => {
  it("reduces corporate names to a searchable core", () => {
    expect(companyCore("Teva Pharmaceuticals USA, Inc.")).toBe("Teva");
    expect(companyCore("BRISTOL MYERS SQUIBB")).toBe("Bristol Myers Squibb");
    expect(companyCore("Novo Nordisk A/S")).toBe("Novo Nordisk");
    expect(companyCore("Pharma Inc")).toBe("Pharma Inc");
  });
  it("matches the same company written differently", () => {
    expect(sameCompany("Eli Lilly and Company", "ELI LILLY AND CO")).toBe(true);
    expect(sameCompany("Pfizer Inc", "Merck Sharp & Dohme LLC")).toBe(false);
    expect(sameCompany("Sun Yat-sen University", "Sun Pharmaceutical Industries Ltd")).toBe(false);
  });
});

describe("Drugs@FDA applications", () => {
  const apps = [
    { application_number: "ANDA076543", sponsor_name: "ZYDUS PHARMACEUTICALS USA INC", products: [{ marketing_status: "Prescription" }] },
    { application_number: "NDA020357", sponsor_name: "BRISTOL MYERS SQUIBB", products: [{ brand_name: "GLUCOPHAGE", marketing_status: "Discontinued" }],
      submissions: [{ submission_type: "ORIG", submission_status: "AP", submission_status_date: "19950303" }] },
    { application_number: "ANDA011111", sponsor_name: "OLD GENERICS LTD", products: [{ marketing_status: "Discontinued" }] },
  ].map((a) => toApplication(a)!);

  it("classifies application types and approval date", () => {
    expect(apps[1]).toMatchObject({ type: "NDA", approvedOn: "1995-03-03", brandNames: ["GLUCOPHAGE"], activeProducts: 0 });
    expect(apps[1].url).toContain("ApplNo=020357");
  });
  it("lists the original brand holder first, then marketed generics", () => {
    expect(groupByCompany(apps).map((c) => c.core)).toEqual(["Bristol Myers Squibb", "Zydus", "Old Generics"]);
  });
});

it("formats company names for display", () => {
  expect(displayCompany("PLACEHOLDER GENERICS USA LLC")).toBe("Placeholder Generics USA LLC");
  expect(displayCompany("Demo Pharmaceuticals Inc.")).toBe("Demo Pharmaceuticals Inc");
});
