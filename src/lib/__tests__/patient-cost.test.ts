import { describe, expect, it } from "vitest";
import { patientCosts, referenceProduct, type PatientCostInput } from "../patient-cost";
import type { CoverageStats } from "../cost-details";

const coverage = { plans: 100, covered: 98, tier: 1, priorAuth: 0, stepTherapy: 0, quantityLimit: 0, medianCopay: 0, copayPlans: 90, coinsurancePlans: 8 } as unknown as CoverageStats;
const base: PatientCostInput = {
  drug: "metformin",
  generic: [
    { description: "METFORMIN HCL 500 MG TABLET", perUnit: 0.02, unit: "EA", effectiveDate: "2026-10-21", brand: false, otc: false },
    { description: "METFORMIN HCL ER 500 MG TABLET STARTER PACK", perUnit: 0.01, unit: "EA", effectiveDate: "2026-10-21", brand: false, otc: false },
  ],
  brand: [],
  partD: [{ brand: "Metformin HCl", generic: "Metformin HCl", avgPerClaim: 7.85 } as never],
  coverage,
  partB: [],
  partBSpending: [],
  comparison: [],
  genericSold: true,
  biosimilars: [],
  insulin: false,
  brandHolders: [],
};

describe("patient cost", () => {
  it("prices a month from the cheapest everyday generic, not a starter pack", () => {
    expect(referenceProduct(base.generic, [])?.description).toBe("METFORMIN HCL 500 MG TABLET");
  });

  it("gives cash, Medicare, Medicaid and employer estimates in plain amounts", () => {
    const pc = patientCosts(base);
    const by = Object.fromEntries(pc.costs.map((c) => [c.who, c.amount]));
    expect(by.cash).toBe("about $6");
    expect(by.medicare).toBe("about $0");
    expect(by.medicaid).toBe("$0–$8");
    expect(by.employer).toBe("about $11");
    expect(pc.script).toMatch(/^Metformin usually costs about \$0 a month with a Medicare drug plan/);
  });

  it("caps insulin at $35 under Medicare and treats costly brands as specialty", () => {
    const insulin = patientCosts({ ...base, drug: "insulin glargine", insulin: true, generic: [], brand: [], partD: [{ brand: "Lantus", generic: "Insulin Glargine", avgPerClaim: 400 } as never] });
    expect(insulin.costs.find((c) => c.who === "medicare")?.amount).toBe("about $35");
    const specialty = patientCosts({ ...base, drug: "adalimumab", genericSold: false, generic: [], brand: [], partD: [{ brand: "Humira", generic: "Adalimumab", avgPerClaim: 7000 } as never] });
    expect(specialty.costs.find((c) => c.who === "employer")?.amount).toBe("often 20–30% of the price");
  });
});
