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

it("strips label cross-references for reading on screen", async () => {
  const { tidyLabel } = await import("../../components/patient-tab");
  expect(tidyLabel("Take once daily ( 2.1 ). Monitor kidney function [see Warnings and Precautions ( 5.1 )].")).toBe("Take once daily. Monitor kidney function.");
});

it("ignores quoted references to guide headings", async () => {
  const { parseMedGuide, items } = await import("../medguide");
  const g = parseMedGuide(
    'What is the most important information I should know about X? X may cause tumors. See "What are the possible side effects of X?" for more. ' +
      "How should I take X? • Take X once a day. What are the possible side effects of X? X may cause serious side effects, including: " +
      '• See "What is the most important information I should know about X?" • inflammation of your pancreas.',
  );
  expect(items(g.howToTake)).toEqual(["Take X once a day."]);
  expect(items(g.sideEffects)).toContain("inflammation of your pancreas.");
});

describe("patient view details", () => {
  it("reads how often side effects happened from the label's trial table", async () => {
    const { sideEffectRates } = await import("../patient-info");
    const table = {
      rows: [
        ["Adverse Reaction", "Metformin (n=141) %", "Placebo (n=145) %"],
        ["Gastrointestinal Disorders", "", ""],
        ["Diarrhea*", "53.2", "11.7"],
        ["Nausea/Vomiting", "25.5", "8.3"],
        ["Headache", "5.7", "4.8"],
        ["Rare thing", "0.4", "0.1"],
      ],
    };
    expect(sideEffectRates(table)).toEqual([
      { effect: "Diarrhea", percent: 53.2, placebo: 11.7 },
      { effect: "Nausea/vomiting", percent: 25.5, placebo: 8.3 },
      { effect: "Headache", percent: 5.7, placebo: 4.8 },
    ]);
    // Count (percent) cells.
    expect(sideEffectRates({ rows: [["Reaction", "Drug N=200", "Placebo N=200"], ["Nausea", "40 (20.0)", "10 (5.0)"]] })).toEqual([{ effect: "Nausea", percent: 20, placebo: 5 }]);
  });

  it("puts safety first in the top things to know, at most five", async () => {
    const { topFiveFrom } = await import("../patient-info");
    const top = topFiveFrom({
      mostImportant: "It can cause lactic acidosis, a rare but serious problem. More text.",
      howToTake: ["Take it with meals."],
      commonSideEffects: ["Diarrhea", "Nausea", "Upset stomach"],
      call911: ["Trouble breathing or swelling (allergy).", "Feeling very weak or cold with muscle pain."],
      avoid: ["Do not drink a lot of alcohol.", "Tell your doctor and pharmacist about every medicine you take."],
    });
    expect(top).toHaveLength(5);
    expect(top[0]).toMatch(/^It can cause lactic acidosis/);
    expect(top[2]).toBe("Common side effects: diarrhea, nausea, upset stomach. Tell your doctor if they bother you.");
    expect(top[3]).toMatch(/^Get emergency help for: feeling very weak/);
  });
});

describe("interactions for patients", () => {
  it("lists the medicines a Medication Guide says to mention", async () => {
    const { interactionItems } = await import("../patient-info");
    const guide = "Tell your healthcare provider about all the medicines you take. Especially tell your healthcare provider if you take: • water pills (diuretics) • topiramate • insulin Know the medicines you take.";
    expect(interactionItems(guide)).toEqual(["water pills (diuretics)", "topiramate", "insulin"]);
  });

  it("reads interaction headings from the label when there is no guide", async () => {
    const { interactionHeadings } = await import("../patient-info");
    const label =
      "7.1 Carbonic Anhydrase Inhibitors Topiramate or other carbonic anhydrase inhibitors frequently cause a decrease in serum bicarbonate. 7.2 Drugs that Reduce Metformin Clearance Concomitant use of drugs that interfere with renal tubular transport systems. 7.3 Alcohol Alcohol is known to potentiate the effect of metformin.";
    expect(interactionHeadings(label)).toEqual(["Carbonic anhydrase inhibitors", "Drugs that reduce metformin clearance", "Alcohol"]);
  });
});

describe("sentence splitting", () => {
  it("keeps decimals and section numbers inside a sentence", async () => {
    const { sentences } = await import("../medguide");
    expect(sentences("The needle cover for the Pen 40 mg/0.8 mL contains latex. See section 2.1 for details. Next one.")).toEqual([
      "The needle cover for the Pen 40 mg/0.8 mL contains latex.",
      "See section 2.1 for details.",
      "Next one.",
    ]);
  });
});
