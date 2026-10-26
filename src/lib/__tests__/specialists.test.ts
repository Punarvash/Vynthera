import { describe, expect, it } from "vitest";
import { aggregatePrescribers } from "../sources/prescribers";
import { toProvider } from "../sources/nppes";
import { cleanFilters, fromTopIndex, nppesTaxonomy } from "../specialists";
import type { TopPrescribersFile } from "../cost-data";
import { TopPrescribers } from "../../../scripts/costs/parse-extra";

describe("prescriber experience", () => {
  it("sums claims across brands and keeps suppressed patient counts unknown", () => {
    const out = aggregatePrescribers([
      { Prscrbr_NPI: "1", Prscrbr_First_Name: "A", Prscrbr_Last_Org_Name: "B", Brnd_Name: "Glucophage", Tot_Clms: "20", Tot_Benes: "" },
      { Prscrbr_NPI: "1", Brnd_Name: "Metformin HCl", Tot_Clms: "100", Tot_Benes: "40" },
      { Prscrbr_NPI: "2", Brnd_Name: "Metformin HCl", Tot_Clms: "300", Tot_Benes: "90" },
    ]);
    expect(out.map((p) => [p.npi, p.claims, p.patients])).toEqual([["2", 300, 90], ["1", 120, 40]]);
    expect(out[1].brands).toEqual(["Glucophage", "Metformin HCl"]);
  });
});

describe("NPI Registry", () => {
  it("uses the practice location and primary specialty", () => {
    const p = toProvider({
      number: 1234567890,
      basic: { first_name: "JANE", last_name: "DOE", credential: "M.D." },
      addresses: [
        { address_purpose: "MAILING", address_1: "PO BOX 1", city: "X", state: "TX" },
        { address_purpose: "LOCATION", address_1: "1 MAIN ST", city: "AUSTIN", state: "TX", postal_code: "787010000", telephone_number: "512-555-0100" },
      ],
      taxonomies: [{ desc: "Internal Medicine" }, { desc: "Rheumatology", primary: true }],
    })!;
    expect(p).toMatchObject({ npi: "1234567890", name: "Jane Doe", credential: "MD", specialty: "Rheumatology", address: "1 Main St", city: "Austin, TX 78701", phone: "512-555-0100" });
    expect(toProvider({ number: "12" })).toBeNull();
  });
});

describe("filters", () => {
  it("accepts only known states and specialties", () => {
    expect(cleanFilters({ state: "tx", city: "Houston<script>", specialty: "Endocrinology", zip: "77070-1148" })).toEqual({ state: "TX", city: "Houstonscript", zip: "77070", specialty: "Endocrinology" });
    expect(cleanFilters({ state: "ZZ", specialty: "Made up" })).toEqual({ state: undefined, city: undefined, zip: undefined, specialty: undefined });
  });
});

describe("condition matching for specialists", async () => {
  const { specialtiesFor } = await import("../condition-specialties");
  const { cmsFilter } = await import("../sources/prescribers");
  const { aggregateAdministrators } = await import("../sources/partb-providers");
  it("maps conditions and abbreviations to the specialties that treat them", () => {
    expect(specialtiesFor("polycystic ovary syndrome")).toEqual(["Obstetrics & Gynecology", "Endocrinology"]);
    expect(specialtiesFor("PCOS")).toContain("Obstetrics & Gynecology");
    expect(specialtiesFor("strep throat")).toEqual(["Family Practice", "Pediatric Medicine", "Otolaryngology"]);
    expect(specialtiesFor("rheumatoid arthritis")[0]).toBe("Rheumatology");
    expect(specialtiesFor(undefined)).toEqual([]);
  });
  it("builds single and IN filters for the CMS data API", () => {
    const q = new URLSearchParams();
    cmsFilter(q, "Gnrc_Name", ["Metformin HCl"]);
    cmsFilter(q, "Prscrbr_Type", ["Endocrinology", "Obstetrics & Gynecology"]);
    expect(q.get("filter[Gnrc_Name]")).toBe("Metformin HCl");
    expect(q.get("filter[Prscrbr_Type][condition][operator]")).toBe("IN");
    expect(q.get("filter[Prscrbr_Type][condition][value][2]")).toBe("Obstetrics & Gynecology");
  });
  it("combines Part B rows per clinician and skips organizations", () => {
    const rows = [
      { Rndrng_NPI: "1", Rndrng_Prvdr_First_Name: "Ann", Rndrng_Prvdr_Last_Org_Name: "Lee", Rndrng_Prvdr_Ent_Cd: "I", HCPCS_Cd: "J1745", Tot_Benes: "14", Tot_Srvcs: "100" },
      { Rndrng_NPI: "1", Rndrng_Prvdr_Ent_Cd: "I", HCPCS_Cd: "Q5103", Tot_Benes: "6", Tot_Srvcs: "40" },
      { Rndrng_NPI: "2", Rndrng_Prvdr_Last_Org_Name: "Infusion Center", Rndrng_Prvdr_Ent_Cd: "O", HCPCS_Cd: "J1745", Tot_Benes: "90" },
    ];
    expect(aggregateAdministrators(rows)).toMatchObject([{ npi: "1", name: "Ann Lee", patients: 20, services: 140, codes: ["J1745", "Q5103"] }]);
  });
});

describe("nationwide top-prescriber index", () => {
  const header = ["Prscrbr_NPI", "Prscrbr_Last_Org_Name", "Prscrbr_First_Name", "Prscrbr_City", "Prscrbr_State_Abrvtn", "Prscrbr_Type", "Brnd_Name", "Gnrc_Name", "Tot_Clms", "Tot_Benes"];
  const row = (npi: string, type: string, generic: string, claims: number, benes = "") => [npi, `Last${npi}`, `First${npi}`, "HOUSTON", "TX", type, "Brand", generic, String(claims), benes];

  it("keeps the top prescribers overall and per specialty, merging brands and leaving dentists out of the overall list", () => {
    const top = new TopPrescribers(new Set(["Endocrinology"]), /^dentist/i, 2, 1);
    top.header(header);
    top.add(row("1", "Endocrinology", "Semaglutide", 50, "20"));
    top.add(row("1", "Endocrinology", "Semaglutide", 30, "25"));
    top.add(row("2", "Family Practice", "Semaglutide", 70));
    top.add(row("3", "Nurse Practitioner", "Semaglutide", 10));
    top.add(row("4", "Dentist", "Semaglutide", 900));
    top.add(row("5", "Endocrinology", "Semaglutide", 60));
    const file = top.result(2024, "x");
    expect(file.drugs.Semaglutide.all).toEqual([["1", 80, 25], ["2", 70, 0]]);
    expect(file.drugs.Semaglutide.types.Endocrinology).toEqual([["1", 80, 25]]);
    expect(Object.keys(file.people).sort()).toEqual(["1", "2"]);
  });

  it("sums a prescriber over the condition's drugs and filters by specialty", () => {
    const file = {
      year: 2024,
      sourceUrl: "x",
      people: { "1": ["Ann", "Lee", "HOUSTON", "TX", "Endocrinology"], "2": ["Bo", "Ng", "AUSTIN", "TX", "Family Practice"] },
      drugs: {
        Semaglutide: { all: [["2", 90, 30], ["1", 40, 0]], types: { Endocrinology: [["1", 40, 0]] } },
        "Metformin HCl": { all: [["1", 70, 50]], types: { Endocrinology: [["1", 70, 50]] } },
      },
    } as TopPrescribersFile;
    const all = fromTopIndex(file, ["Semaglutide", "Metformin HCl"]);
    expect(all.map((p) => [p.npi, p.claims, p.patients])).toEqual([["1", 110, 50], ["2", 90, 30]]);
    expect(all[0].brands).toEqual(["Semaglutide", "Metformin HCl"]);
    expect(fromTopIndex(file, ["Semaglutide"], ["Endocrinology"]).map((p) => p.name)).toEqual(["Ann Lee"]);
  });

  it("maps CMS specialty names to NPI Registry taxonomy names", () => {
    expect(nppesTaxonomy("Family Practice")).toBe("Family Medicine");
    expect(nppesTaxonomy("Pediatric Medicine")).toBe("Pediatrics");
    expect(nppesTaxonomy("Cardiology")).toBe("Cardiology");
  });
});
