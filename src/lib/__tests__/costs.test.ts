import { describe, expect, it } from "vitest";
import { NadacAccumulator, parsePartD, pickApi, pickCsv, pickDataset, splitCsvLine, toIsoDate, endsInsideQuotes } from "../../../scripts/costs/parse.ts";
import { formatProduct, money, nadacForDrug, partDForDrug, priceRange } from "../costs";
import { demoNadac, demoPartD } from "../demo/costs";

describe("CSV parsing", () => {
  it("handles quotes, embedded commas and doubled quotes", () => {
    expect(splitCsvLine('a,"b, c","say ""hi""",')).toEqual(["a", "b, c", 'say "hi"', ""]);
    expect(endsInsideQuotes('a,"open')).toBe(true);
    expect(toIsoDate("1/8/2025")).toBe("2025-01-08");
    expect(toIsoDate("2025-01-08T00:00:00")).toBe("2025-01-08");
  });
});

describe("NADAC accumulation", () => {
  it("keeps the latest weekly price per product", () => {
    const acc = new NadacAccumulator();
    acc.setHeader(["NDC Description", "NDC", "NADAC_Per_Unit", "Effective_Date", "Pricing_Unit", "OTC", "Classification_for_Rate_Setting", "As of Date"]);
    acc.add(["METFORMIN HCL 500 MG TABLET", "1", "0.02", "12/01/2024", "EA", "N", "G", "12/04/2024"]);
    acc.add(["METFORMIN HCL 500 MG TABLET", "1", "0.018", "01/01/2025", "EA", "N", "G", "01/08/2025"]);
    acc.add(["GLUCOPHAGE 500 MG TABLET", "2", "1.10", "01/01/2025", "EA", "N", "B", "01/08/2025"]);
    acc.add(["BAD ROW", "3", "n/a", "", "EA", "N", "G", ""]);
    expect(acc.rows()).toEqual([
      ["GLUCOPHAGE 500 MG TABLET", 1.1, "EA", "2025-01-01", "B", "N"],
      ["METFORMIN HCL 500 MG TABLET", 0.018, "EA", "2025-01-01", "G", "N"],
    ]);
    expect(acc.latestAsOf).toBe("2025-01-08");
  });

  it("fails loudly when the file layout changes", () => {
    expect(() => new NadacAccumulator().setHeader(["foo", "bar"])).toThrow(/missing columns/);
  });
});

describe("Part D spending", () => {
  it("reads the newest year's Overall rows", () => {
    const header = ["Brnd_Name", "Gnrc_Name", "Tot_Mftr", "Mftr_Name", "Tot_Spndng_2022", "Tot_Spndng_2023", "Tot_Clms_2023", "Avg_Spnd_Per_Clm_2023", "Chg_Avg_Spnd_Per_Dsg_Unt_22_23"];
    const { year, rows } = parsePartD(header, [
      ["Glucophage", "Metformin HCl", "1", "Overall", "9", "2,000", "10", "200", "0.1"],
      ["Glucophage", "Metformin HCl", "1", "Some Maker", "9", "1", "1", "1", "0"],
    ]);
    expect(year).toBe(2023);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brand: "Glucophage", totalSpending: 2000, claims: 10, avgPerClaim: 200, changePerUnit: 0.1 });
  });
});

describe("dataset discovery", () => {
  const catalog = [
    { title: "NADAC (National Average Drug Acquisition Cost) 2025", distribution: [{ downloadURL: "https://x/2025.csv", mediaType: "text/csv" }] },
    { title: "NADAC (National Average Drug Acquisition Cost) 2026", distribution: [{ downloadURL: "https://x/2026.csv", mediaType: "text/csv" }] },
    { title: "NADAC Comparison", distribution: [] },
  ];
  it("picks the newest yearly dataset and its CSV", () => {
    const d = pickDataset(catalog, /^NADAC \(National Average Drug Acquisition Cost\)/i)!;
    expect(pickCsv(d)?.downloadURL).toBe("https://x/2026.csv");
  });
  it("picks the newest data API endpoint", () => {
    const d = { distribution: [
      { title: "Prescribers : 2022", accessURL: "https://data.cms.gov/data-api/v1/dataset/aaa/data" },
      { title: "Prescribers : 2023", accessURL: "https://data.cms.gov/data-api/v1/dataset/bbb/data" },
      { title: "Prescribers : 2023 CSV", downloadURL: "https://x.csv" },
    ] };
    expect(pickApi(d)?.accessURL).toContain("/bbb/");
  });
});

describe("matching cost data to a drug", () => {
  it("matches single-ingredient products and the brand, not combinations", () => {
    const rows = [...demoNadac.rows, ["SITAGLIPTIN-METFORMIN HCL 50-500 MG TAB", 2, "EA", "2026-01-01", "B", "N"] as (typeof demoNadac.rows)[number]];
    const prices = nadacForDrug(rows, ["metformin", "Glucophage"]);
    expect(prices.map((p) => p.description)).toEqual([
      "METFORMIN HCL 500 MG TABLET", "METFORMIN HCL 1,000 MG TABLET", "METFORMIN HCL ER 500 MG TABLET", "GLUCOPHAGE 500 MG TABLET",
    ]);
    expect(priceRange(prices.filter((p) => !p.brand))).toEqual({ min: 0.02, max: 0.05, unit: "EA" });
    expect(partDForDrug(demoPartD.rows, "metformin").map((r) => r.brand)).toEqual(["Metformin HCl", "Glucophage"]);
  });
  it("formats money for small and large values", () => {
    expect(money(0.0175)).toBe("$0.018");
    expect(money(0.5)).toBe("$0.50");
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(150_000_000)).toBe("$150.0 million");
  });
});

it("formats NADAC product names", () => {
  expect(formatProduct("METFORMIN HCL ER 500 MG TABLET")).toBe("Metformin HCl ER 500 mg tablet");
  expect(formatProduct("INSULIN GLARGINE 100 UNIT/ML VIAL")).toBe("Insulin glargine 100 unit/mL vial");
});
