// Placeholder cost data for VYNTHERA_DEMO_DATA=1. Prices are made up for interface testing only.
import type { CostMeta, NadacFile, NegotiatedFile, PartBFile, PartDFile, PlanCoverageFile, VaFile } from "../cost-data";

export const demoNadac: NadacFile = {
  datasetTitle: "NADAC demo placeholder",
  sourceUrl: "https://data.medicaid.gov/",
  asOf: "2026-10-14",
  rows: [
    ["GLUCOPHAGE 500 MG TABLET", 1.1, "EA", "2026-10-14", "B", "N"],
    ["METFORMIN HCL 500 MG TABLET", 0.02, "EA", "2026-10-14", "G", "N"],
    ["METFORMIN HCL 1,000 MG TABLET", 0.03, "EA", "2026-10-14", "G", "N"],
    ["METFORMIN HCL ER 500 MG TABLET", 0.05, "EA", "2026-10-14", "G", "N"],
  ],
};

export const demoPartD: PartDFile = {
  datasetTitle: "Medicare Part D Spending by Drug demo placeholder",
  sourceUrl: "https://data.cms.gov/",
  year: 2024,
  rows: [
    {
      brand: "Metformin HCl", generic: "Metformin HCl", manufacturers: 30, totalSpending: 100_000_000, claims: 20_000_000,
      beneficiaries: 5_000_000, dosageUnits: 1_000_000_000, avgPerUnit: 0.1, avgPerClaim: 5, avgPerBeneficiary: 20, changePerUnit: -0.04,
    },
    {
      brand: "Glucophage", generic: "Metformin HCl", manufacturers: 1, totalSpending: 1_000_000, claims: 5_000,
      beneficiaries: 1_000, dosageUnits: 300_000, avgPerUnit: 3.3, avgPerClaim: 200, avgPerBeneficiary: 1000, changePerUnit: 0.08,
    },
  ],
};

export const demoMeta: CostMeta = {
  importedAt: "2026-10-20",
  nadac: { title: demoNadac.datasetTitle, url: demoNadac.sourceUrl, asOf: demoNadac.asOf, rows: 4 },
  partD: { title: demoPartD.datasetTitle, url: demoPartD.sourceUrl, year: 2024, rows: 2 },
  prescribers: { title: "Prescribers demo placeholder", apiUrl: "https://data.cms.gov/data-api/v1/dataset/demo/data", year: 2024 },
};

export const demoPlanCoverage: PlanCoverageFile = {
  year: 2026,
  asOf: "2026-09-16",
  sourceUrl: "https://data.cms.gov/",
  totalPlans: 100,
  insurers: [
    { name: "Demo Insurer A", plans: 60 },
    { name: "Demo Insurer B", plans: 40 },
  ],
  states: [
    { code: "TX", plans: 70 },
    { code: "OK", plans: 30 },
  ],
  drugs: {
    "000001": {
      all: [95, 1, 0, 0, 20, 0, -1, 10, 95, 0],
      insurers: [
        [0, 60, 1, 0, 0, 10, 0, -1, 5, 60, 0],
        [1, 35, 1, 0, 0, 10, 2, -1, 5, 35, 0],
      ],
      states: [
        [0, 68],
        [1, 27],
      ],
    },
  },
};

export const demoPartB: PartBFile = { quarter: "October 1, 2026 through December 31, 2026", sourceUrl: "https://www.cms.gov/", rows: [] };

export const demoNegotiated: NegotiatedFile = { sourceUrl: "https://www.cms.gov/", asOf: "2026-09-21", rows: [] };

export const demoVa: VaFile = {
  sourceUrl: "https://www.va.gov/",
  asOf: "2026-10-15",
  rows: [["METFORMIN HCL 500MG TAB", 0.01, "EA", "FSS", ""]],
};
