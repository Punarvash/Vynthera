import { describe, expect, it } from "vitest";
import { demoLabel } from "../demo/responses";
import { parseLabelTable, toDrugLabel } from "../sources/openfda";
import { parseMedlinePlus } from "../sources/medlineplus";
import { basicPlainLanguage } from "../patient-info";
import { assessGrade } from "../grade";
import type { EvidenceBundle } from "../evidence";

describe("label sections for patients", () => {
  it("reads dosage, boxed warning, rxcui and the adverse reaction table as plain cells", () => {
    const l = toDrugLabel(demoLabel)!;
    expect(l.dosage).toMatch(/^Placeholder dosage/);
    expect(l.boxedWarning).toMatch(/^PLACEHOLDER BOXED/);
    expect(l.rxcuis).toEqual(["000001"]);
    expect(l.adverseTable?.rows[0]).toEqual(["Reaction", "Drug (%)", "Placebo (%)"]);
    expect(l.adverseTable?.caption).toBe("Table 1 (demo placeholder)");
  });

  it("ignores tables with no data rows and strips markup inside cells", () => {
    expect(parseLabelTable("<table><tr><th>Only header</th></tr></table>")).toBeUndefined();
    expect(parseLabelTable("<tr><td><b>a</b> &amp; b</td></tr><tr><td>c</td></tr>")?.rows[0]).toEqual(["a & b"]);
  });
});

describe("MedlinePlus Connect", () => {
  it("keeps entries with a title and secure link", () => {
    const entries = parseMedlinePlus({
      feed: {
        entry: [
          { title: { _value: "Metformin" }, link: [{ href: "https://medlineplus.gov/druginfo/meds/a696005.html" }], summary: { _value: "<p>Used for <b>diabetes</b>.</p>" } },
          { title: { _value: "" }, link: [{ href: "https://x" }] },
        ],
      },
    });
    expect(entries).toEqual([{ title: "Metformin", url: "https://medlineplus.gov/druginfo/meds/a696005.html", summary: "Used for diabetes." }]);
  });
});

describe("plain-language patient view without AI", () => {
  const bundle = {
    drug: "metformin",
    condition: "polycystic ovary syndrome",
    label: toDrugLabel(demoLabel),
    labelStatus: { kind: "off-label" },
    studies: [],
    preprints: [],
    trials: [],
    grade: assessGrade({ condition: "polycystic ovary syndrome", counts: null, rated: [], conditionPhrases: [], directionsAssessed: false }),
  } as unknown as EvidenceBundle;

  it("explains off-label use kindly and adds the insurance question", () => {
    const p = basicPlainLanguage(bundle, []);
    expect(p.whatItIsFor).toMatch(/"off-label" use/);
    expect(p.benefits[0]).toMatch(/not been studied/);
    expect(p.seriousRisks[0]).toMatch(/boxed warning/);
    expect(p.questions.at(-1)).toMatch(/insurance cover this off-label/);
  });
});
