import { describe, expect, it } from "vitest";
import { CostReader, FormularyReader, insurerName, PlanReader, summarizeCoverage } from "../../../scripts/costs/parse-formulary";
import { NadacHistory, packageUnits, parseNegotiated, parsePartB, parseSharedStrings, parseVaPrices, sheetRows } from "../../../scripts/costs/parse-extra";

const split = (lines: string) => lines.trim().split("\n").map((l) => l.split("|"));

describe("Part D formulary summary", () => {
  it("groups insurers by plan and contract names", () => {
    expect(insurerName("AARP Medicare Rx Saver from UHC (PDP)", "UNITEDHEALTHCARE INSURANCE COMPANY")).toBe("UnitedHealthcare");
    expect(insurerName("Humana Gold Plus SNP-DE H0028-007 (HMO D-SNP)", "CHA HMO, INC.")).toBe("Humana");
    expect(insurerName("SilverScript Choice (PDP)", "SILVERSCRIPT INSURANCE COMPANY")).toBe("Aetna (CVS Health)");
    expect(insurerName("Prescription Blue Select (PDP)", "BCBSM")).toBe("Blue Cross Blue Shield plans");
    expect(insurerName("Acme Advantage (HMO)", "ACME HEALTH PLAN, INC.")).toBe("Acme");
  });

  it("summarizes coverage, tier, restrictions and copays per drug", () => {
    const plans = new PlanReader();
    const [ph, ...prows] = split(`
CONTRACT_ID|PLAN_ID|SEGMENT_ID|CONTRACT_NAME|PLAN_NAME|FORMULARY_ID|PREMIUM|DEDUCTIBLE|MA_REGION_CODE|PDP_REGION_CODE|STATE|COUNTY_CODE|SNP|PLAN_SUPPRESSED_YN
S0001|001|000|SILVERSCRIPT INSURANCE COMPANY|SilverScript Choice (PDP)|F1|30|615| |1|TX|1|0|N
S0001|001|000|SILVERSCRIPT INSURANCE COMPANY|SilverScript Choice (PDP)|F1|30|615| |1|OK|2|0|N
H0002|001|000|CHA HMO, INC.|Humana Gold Plus (HMO)|F2|0|0|1| |TX|1|0|N
H0003|001|000|CHA HMO, INC.|Humana Hidden (HMO)|F2|0|0|1| |TX|1|0|Y`);
    plans.header(ph);
    prows.forEach((r) => plans.add(r));
    expect(plans.plans.size).toBe(3 - 1);

    const costs = new CostReader();
    const [ch, ...crows] = split(`
CONTRACT_ID|PLAN_ID|SEGMENT_ID|COVERAGE_LEVEL|TIER|DAYS_SUPPLY|COST_TYPE_PREF|COST_AMT_PREF|COST_MIN_AMT_PREF|COST_MAX_AMT_PREF|COST_TYPE_NONPREF|COST_AMT_NONPREF|COST_MIN_AMT_NONPREF|COST_MAX_AMT_NONPREF|COST_TYPE_MAIL_PREF|COST_AMT_MAIL_PREF|COST_MIN_AMT_MAIL_PREF|COST_MAX_AMT_MAIL_PREF|COST_TYPE_MAIL_NONPREF|COST_AMT_MAIL_NONPREF|COST_MIN_AMT_MAIL_NONPREF|COST_MAX_AMT_MAIL_NONPREF|TIER_SPECIALTY_YN|DED_APPLIES_YN
S0001|001|000|1|1|1|1|2|0|0|1|5|0|0|1|0|0|0|1|0|0|0|N|N
S0001|001|000|0|1|1|1|99|0|0|1|99|0|0|1|0|0|0|1|0|0|0|N|N
H0002|001|000|1|3|1|0|0|0|0|2|0.25|0|0|1|0|0|0|1|0|0|0|N|Y`);
    costs.header(ch);
    crows.forEach((r) => costs.add(r));

    const formulary = new FormularyReader();
    const [fh, ...frows] = split(`
FORMULARY_ID|FORMULARY_VERSION|CONTRACT_YEAR|RXCUI|NDC|TIER_LEVEL_VALUE|QUANTITY_LIMIT_YN|QUANTITY_LIMIT_AMOUNT|QUANTITY_LIMIT_DAYS|PRIOR_AUTHORIZATION_YN|STEP_THERAPY_YN|SELECTED_DRUG_YN
F1|1|2026|861007|1|1|N|||N|N|N
F2|1|2026|861007|2|3|Y|30|30|Y|N|N`);
    formulary.header(fh);
    frows.forEach((r) => formulary.add(r));

    const s = summarizeCoverage([...plans.plans.values()], formulary.formularies, costs.costs, { year: 2026, asOf: "2026-09-16", sourceUrl: "x" });
    expect(s.totalPlans).toBe(2);
    expect(s.states).toEqual([{ code: "OK", plans: 1 }, { code: "TX", plans: 2 }]);
    const d = s.drugs["861007"];
    // covered, tier, PA, ST, QL, median copay, median coinsurance, deductible applies, copay plans, coinsurance plans
    expect(d.all).toEqual([2, 1, 1, 0, 1, 2, 0.25, 1, 1, 1]);
    const humana = s.insurers.findIndex((i) => i.name === "Humana");
    expect(d.insurers.find((r) => r[0] === humana)).toEqual([humana, 1, 3, 1, 0, 1, -1, 0.25, 1, 0, 1]);
    expect(d.states).toEqual([[0, 1], [1, 2]]);
  });
});

describe("other cost files", () => {
  it("joins Part B payment limits to product names", () => {
    const limits = [["Payment Allowance Limits"], ["HCPCS Code", "Short Description", "HCPCS Code Dosage", "Payment Limit", "Co-insurance Percentage"], ["J1745", "Infliximab not biosimil 10mg", "10 MG", "40.123", "20.000"]];
    const crosswalk = [["title"], ["_2026_CODE", "Short Description", "LABELER NAME", "NDC", "Drug Name"], ["J1745", "Infliximab", "Janssen", "57894-0030-01", "Remicade "]];
    expect(parsePartB(limits, crosswalk)).toEqual([{ hcpcs: "J1745", description: "Infliximab not biosimil 10mg", dosage: "10 MG", limit: 40.123, coinsurance: 0.2, drugNames: ["remicade"] }]);
  });

  it("keeps one negotiated price per drug and period", () => {
    const header = "IPAY,Selected Drug Name,Active Ingredient Name or Active Moiety Name,NDC-9,NDC-11,XREF NDC-11,HCPCS Code,MFP Effective Date,MFP End Date,Single MFP per 30 DES,NDC-9 MFP per Unit Price".split(",");
    const rows = [
      ["2026", "ELIQUIS", "APIXABAN", "", "a", "", "", "01/01/2026", "12/31/2026", "231", "4.1"],
      ["2026", "ELIQUIS", "APIXABAN", "", "b", "", "", "01/01/2026", "12/31/2026", "231", "4.1"],
      ["2026", "ELIQUIS", "APIXABAN", "", "a", "", "", "01/01/2027", "", "237.25", "4.2"],
    ];
    expect(parseNegotiated(header, rows)).toEqual([
      { ipay: 2026, drug: "ELIQUIS", ingredient: "apixaban", effective: "2026-01-01", end: "2026-12-31", price30Day: 231 },
      { ipay: 2026, drug: "ELIQUIS", ingredient: "apixaban", effective: "2027-01-01", end: "", price30Day: 237.25 },
    ]);
  });

  it("reads the VA price list from worksheet XML", () => {
    const strings = parseSharedStrings("<sst><si><t>Generic</t></si><si><t>PackageDescription</t></si><si><t>Price</t></si><si><t>PriceType</t></si><si><t>LISINOPRIL 10MG TAB</t></si><si><t>90</t></si><si><t>FSS</t></si><si><t>Big4</t></si></sst>");
    const sheet =
      '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>1.80</v></c><c r="D2" t="s"><v>6</v></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c><c r="C3"><v>0.90</v></c><c r="D3" t="s"><v>7</v></c></row></sheetData>';
    expect(parseVaPrices(sheetRows(sheet, strings), "2026-10-15")).toEqual([["LISINOPRIL 10MG TAB", 0.01, "EA", "Big4", ""]]);
    expect(packageUnits("15ML")).toEqual({ count: 15, unit: "ML" });
    expect(packageUnits("1 KIT")).toEqual({ count: 1, unit: "PKG" });
  });

  it("builds monthly NADAC medians from the latest survey in each month", () => {
    const h = new NadacHistory();
    h.add("X 1 MG TABLET", 0.1, "2026-01-07");
    h.add("X 1 MG TABLET", 0.3, "2026-01-28");
    h.add("X 1 MG TABLET", 0.5, "2026-01-28");
    h.add("X 1 MG TABLET", 0.2, "2026-03-04");
    h.add("Y", 1, "2026-02-04");
    expect(h.result(new Set(["X 1 MG TABLET"]))).toEqual({ months: ["2026-01", "2026-02", "2026-03"], rows: { "X 1 MG TABLET": [0.3, null, 0.2] } });
  });
});
