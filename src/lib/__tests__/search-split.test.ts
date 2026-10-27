import { describe, expect, it } from "vitest";
import { splitQuery, suggest } from "../suggest";

// Uses the imported drug lists in data/costs and data/search, like the live search box.
describe("one search box", () => {
  it("splits a drug and a condition typed together", async () => {
    expect(await splitQuery("metformin pcos")).toEqual({ drug: "Metformin", condition: "Polycystic Ovary Syndrome" });
    expect(await splitQuery("metformin for polycystic ovary syndrome")).toMatchObject({ drug: "Metformin" });
    expect((await splitQuery("PCOS metformin")).drug).toBe("Metformin");
    expect((await splitQuery("amoxicilin for strep throat")).drug).toBe("Amoxicillin");
  });

  it("leaves single names alone", async () => {
    expect(await splitQuery("metformin")).toEqual({});
    expect(await splitQuery("polycystic ovary syndrome")).toEqual({});
    expect(await splitQuery("type 2 diabetes mellitus")).toEqual({});
  });

  it("suggests drug + condition pairs while typing, but not for strengths and forms", async () => {
    const s = await suggest("metformin polycys", ["drug", "condition", "class", "pair"]);
    expect(s[0]).toMatchObject({ kind: "pair" });
    expect(s[0].label).toMatch(/^Metformin for Polycystic/i);
    const er = await suggest("metformin er", ["drug", "condition", "class", "pair"]);
    expect(er.some((x) => x.kind === "pair")).toBe(false);
  });
});
