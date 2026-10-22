import { describe, expect, it } from "vitest";
import { aggregatePrescribers } from "../sources/prescribers";
import { toProvider } from "../sources/nppes";
import { cleanFilters } from "../specialists";

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
    expect(cleanFilters({ state: "tx", city: "Houston<script>", specialty: "Endocrinology" })).toEqual({ state: "TX", city: "Houstonscript", specialty: "Endocrinology" });
    expect(cleanFilters({ state: "ZZ", specialty: "Made up" })).toEqual({ state: undefined, city: undefined, specialty: undefined });
  });
});
