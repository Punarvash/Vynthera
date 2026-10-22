// Placeholder cost data for VYNTHERA_DEMO_DATA=1. Prices are made up for interface testing only.
import type { CostMeta, NadacFile, PartDFile } from "../cost-data";

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
