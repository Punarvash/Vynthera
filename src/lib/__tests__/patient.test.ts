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
    expect(p.mostImportant).toMatch(/boxed warning/);
    expect(p.call911.at(-1)).toMatch(/allergic reaction/);
    expect(p.questions.at(-1)).toMatch(/insurance cover this off-label/);
  });
});

describe("FDA Medication Guide", async () => {
  const { parseMedGuide, splitSideEffects, items } = await import("../medguide");
  const guide =
    "Medication Guide DRUGX (drug-ex) tablets What is the most important information I should know about DRUGX? DRUGX can cause low blood sugar. " +
    "What is DRUGX? DRUGX is a prescription medicine used to treat type 2 diabetes. Who should not take DRUGX? Do not take DRUGX if you: • have severe kidney problems • are allergic to it " +
    "Before taking DRUGX, tell your healthcare provider about all of your medical conditions, including if you: • are pregnant or plan to become pregnant. • are breastfeeding. " +
    "How should I take DRUGX? • Take DRUGX 1 time each day with food. • If you miss a dose, take it as soon as you remember. " +
    "What should I avoid while taking DRUGX? Avoid drinking alcohol. What are the possible side effects of DRUGX? DRUGX may cause serious side effects, including: " +
    "• severe allergic reaction. Get emergency help right away. • kidney problems. Call your doctor. The most common side effects of DRUGX include: • nausea • diarrhea " +
    "These are not all the possible side effects. How should I store DRUGX? • Store at room temperature. What are the ingredients in DRUGX? Active ingredient: drug-ex.";

  it("splits the guide into the questions it answers", () => {
    const g = parseMedGuide(guide);
    expect(g.important).toMatch(/^DRUGX can cause low blood sugar/);
    expect(g.whatIs).toMatch(/^DRUGX is a prescription medicine/);
    expect(items(g.whoShouldNot)).toEqual(["have severe kidney problems", "are allergic to it"]);
    expect(items(g.howToTake)[1]).toMatch(/miss a dose/);
    expect(g.avoid).toBe("Avoid drinking alcohol.");
    expect(g.storage).toMatch(/room temperature/);
  });

  it("sorts side effects into common, call the doctor and call 911", () => {
    const s = splitSideEffects(parseMedGuide(guide).sideEffects);
    expect(s.common).toEqual(["nausea", "diarrhea"]);
    expect(s.call911[0]).toMatch(/severe allergic reaction/);
    expect(s.callDoctor[0]).toMatch(/kidney problems/);
  });
});
