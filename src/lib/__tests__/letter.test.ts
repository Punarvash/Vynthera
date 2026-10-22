import { describe, expect, it } from "vitest";
import { buildLetter } from "@/components/letter-generator";
import { formatCitation } from "../citation";

const evidence = [
  { id: "1", designLabel: "Meta-analysis", authors: "Smith J, Doe A", title: "A study.", journal: "J Med", year: "2024", pmid: "123", url: "u", peerReviewed: true },
];

const fields = {
  patientName: "Pat Example", dob: "01/01/1980", memberId: "M1", groupNumber: "", insurer: "Acme Health",
  diagnosis: "polycystic ovary syndrome", icd10: "E28.2", dose: "500 mg twice daily", history: "h", priorTreatments: "p",
  urgent: true, physicianName: "Dr Who", credentials: "MD", specialty: "Endocrinology", npi: "1234567890", practice: "", phone: "555", fax: "",
};

describe("medical necessity letter", () => {
  it("fills patient, off-label rationale, GRADE and citations", () => {
    const text = buildLetter(fields, { drug: "metformin", approval: "off-label", gradeLabel: "Moderate", evidence }, evidence, "January 1, 2026");
    expect(text).toContain("Patient: Pat Example");
    expect(text).toContain("(ICD-10 E28.2)");
    expect(text).toContain("Metformin is not FDA-approved for polycystic ovary syndrome");
    expect(text).toContain("expedited review");
    expect(text).toContain("rated moderate");
    expect(text).toContain("1. Smith J, Doe A. A study. J Med. 2024. PMID: 123.");
    expect(text).not.toMatch(/\n\n\n/);
  });

  it("marks preprints in citations", () => {
    expect(formatCitation({ ...evidence[0], pmid: undefined, peerReviewed: false })).toMatch(/u \[Preprint, not peer reviewed\]$/);
  });
});
