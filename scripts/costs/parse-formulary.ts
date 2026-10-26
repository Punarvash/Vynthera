// Pure helpers that summarize CMS's monthly Part D formulary files (pipe-delimited) by drug.
// No file or network access, so they are unit-tested; scripts/costs/formulary.ts feeds them.
import type { PlanCoverage, PlanCoverageFile } from "../../src/lib/cost-data.ts";

/** Insurer families, matched against plan and contract names ("AARP Medicare Rx Saver from UHC" -> UnitedHealthcare). */
const INSURERS: [string, RegExp][] = [
  ["UnitedHealthcare", /\b(unitedhealthcare|united healthcare|uhc|aarp|care improvement plus|sierra health|optum)\b/i],
  ["Humana", /\b(humana|cha hmo|cariten|arcadian|emphesys|careplus)\b/i],
  ["Aetna (CVS Health)", /\b(aetna|silverscript|coventry)\b/i],
  ["Wellcare (Centene)", /\b(wellcare|allwell|centene|health net|harmony health|ambetter|peach state|sunshine health|meridian)\b/i],
  ["Elevance (Anthem, Wellpoint)", /\b(anthem|elevance|wellpoint|healthkeepers|amerigroup|simply|community insurance company|empire|freedom health|optimum healthcare)\b/i],
  ["HealthSpring (formerly Cigna)", /\b(healthspring|cigna)\b/i],
  ["Kaiser Permanente", /\bkaiser\b/i],
  ["Blue Cross Blue Shield plans", /\b(blue ?cross|blue ?shield|bluecross|blueshield|bcbs|highmark|florida blue|premera|regence|horizon|excellus|independence|carefirst|wellmark|capital blue|hcsc|health care service corporation|medicareblue|prescription blue|blue medicare|bluemedicare|bluerx|blue rx|blue care)\b/i],
  ["Devoted Health", /\bdevoted\b/i],
  ["Clover Health", /\bclover\b/i],
  ["Alignment Health", /\balignment\b/i],
  ["SCAN Health Plan", /\bscan\b/i],
  ["Molina Healthcare", /\bmolina\b/i],
  ["Triple-S", /\btriple[- ]s\b/i],
  ["MMM Healthcare", /\bmmm\b/i],
  ["MCS", /\bmcs\b/i],
  ["Priority Health", /\bpriority health\b/i],
  ["UPMC Health Plan", /\bupmc\b/i],
  ["Geisinger", /\bgeisinger\b/i],
  ["HealthPartners", /\bhealthpartners\b/i],
  ["Medica", /\bmedica\b/i],
  ["Mutual of Omaha", /\bmutual of omaha\b/i],
  ["Elixir", /\belixir\b/i],
  ["Express Scripts", /\b(express scripts|medco)\b/i],
  ["Zing Health", /\bzing\b/i],
];

export function insurerName(planName: string, contractName: string): string {
  for (const [name, re] of INSURERS) if (re.test(planName) || re.test(contractName)) return name;
  const words = contractName
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(inc|llc|co|corp|corporation|company|insurance|of|the|plan|health|healthcare)$/i.test(w));
  return words.slice(0, 3).map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ") || "Other";
}

export interface Plan {
  key: string;
  formularyId: string;
  insurer: string;
  pdp: boolean;
  states: Set<string>;
}

/** Plan information file: one row per plan and county; returns one entry per plan, without suppressed plans. */
export class PlanReader {
  plans = new Map<string, Plan>();
  private cols: Record<string, number> = {};

  header(fields: string[]): void {
    const names = fields.map((f) => f.trim().toUpperCase());
    for (const k of ["CONTRACT_ID", "PLAN_ID", "SEGMENT_ID", "CONTRACT_NAME", "PLAN_NAME", "FORMULARY_ID", "STATE", "PLAN_SUPPRESSED_YN"]) {
      this.cols[k] = names.indexOf(k);
      if (this.cols[k] < 0) throw new Error(`Plan information file is missing ${k}`);
    }
  }

  add(f: string[]): void {
    const c = this.cols;
    if (f[c.PLAN_SUPPRESSED_YN]?.trim() === "Y") return;
    const key = `${f[c.CONTRACT_ID]}|${f[c.PLAN_ID]}|${f[c.SEGMENT_ID]}`;
    let p = this.plans.get(key);
    if (!p) {
      p = {
        key,
        formularyId: f[c.FORMULARY_ID].trim(),
        insurer: insurerName(f[c.PLAN_NAME] ?? "", f[c.CONTRACT_NAME] ?? ""),
        pdp: (f[c.CONTRACT_ID] ?? "").startsWith("S"),
        states: new Set(),
      };
      this.plans.set(key, p);
    }
    const state = f[c.STATE]?.trim();
    if (state) p.states.add(state);
  }
}

export interface TierCost {
  /** "copay" in dollars, or "coinsurance" as a fraction of the drug's cost. */
  type: "copay" | "coinsurance";
  amount: number;
  deductibleApplies: boolean;
}

/** Beneficiary cost file: each plan's cost per tier for a one-month retail supply in the initial coverage phase. */
export class CostReader {
  /** plan key -> tier -> cost */
  costs = new Map<string, Map<number, TierCost>>();
  private cols: Record<string, number> = {};

  header(fields: string[]): void {
    const names = fields.map((f) => f.trim().toUpperCase());
    for (const k of ["CONTRACT_ID", "PLAN_ID", "SEGMENT_ID", "COVERAGE_LEVEL", "TIER", "DAYS_SUPPLY", "COST_TYPE_PREF", "COST_AMT_PREF", "COST_TYPE_NONPREF", "COST_AMT_NONPREF", "DED_APPLIES_YN"]) {
      this.cols[k] = names.indexOf(k);
      if (this.cols[k] < 0) throw new Error(`Beneficiary cost file is missing ${k}`);
    }
  }

  add(f: string[]): void {
    const c = this.cols;
    // Coverage level 1 is the initial coverage phase; days supply 1 is a one-month supply.
    if (f[c.COVERAGE_LEVEL]?.trim() !== "1" || f[c.DAYS_SUPPLY]?.trim() !== "1") return;
    // Preferred retail pharmacy when the plan has one (cost type 0 = not offered), else standard retail.
    const pref = f[c.COST_TYPE_PREF]?.trim();
    const [typeCode, amount] = pref && pref !== "0" ? [pref, f[c.COST_AMT_PREF]] : [f[c.COST_TYPE_NONPREF]?.trim(), f[c.COST_AMT_NONPREF]];
    if (typeCode !== "1" && typeCode !== "2") return;
    const key = `${f[c.CONTRACT_ID]}|${f[c.PLAN_ID]}|${f[c.SEGMENT_ID]}`;
    const tiers = this.costs.get(key) ?? new Map<number, TierCost>();
    tiers.set(Number(f[c.TIER]), {
      type: typeCode === "1" ? "copay" : "coinsurance",
      amount: Number(amount) || 0,
      deductibleApplies: f[c.DED_APPLIES_YN]?.trim() === "Y",
    });
    this.costs.set(key, tiers);
  }
}

/** Packed per-formulary entry: tier, then flags for prior authorization, step therapy and quantity limit. */
export interface FormularyEntry {
  tier: number;
  pa: boolean;
  st: boolean;
  ql: boolean;
}

/** Basic drugs formulary file: formulary id -> RxCUI -> entry (the first NDC row for each RxCUI). */
export class FormularyReader {
  formularies = new Map<string, Map<string, FormularyEntry>>();
  private cols: Record<string, number> = {};

  header(fields: string[]): void {
    const names = fields.map((f) => f.trim().toUpperCase());
    for (const k of ["FORMULARY_ID", "RXCUI", "TIER_LEVEL_VALUE", "QUANTITY_LIMIT_YN", "PRIOR_AUTHORIZATION_YN", "STEP_THERAPY_YN"]) {
      this.cols[k] = names.indexOf(k);
      if (this.cols[k] < 0) throw new Error(`Formulary file is missing ${k}`);
    }
  }

  add(f: string[]): void {
    const c = this.cols;
    const id = f[c.FORMULARY_ID]?.trim();
    const rxcui = f[c.RXCUI]?.trim();
    if (!id || !rxcui) return;
    const drugs = this.formularies.get(id) ?? new Map<string, FormularyEntry>();
    if (!drugs.has(rxcui)) {
      drugs.set(rxcui, {
        tier: Number(f[c.TIER_LEVEL_VALUE]) || 0,
        pa: f[c.PRIOR_AUTHORIZATION_YN]?.trim() === "Y",
        st: f[c.STEP_THERAPY_YN]?.trim() === "Y",
        ql: f[c.QUANTITY_LIMIT_YN]?.trim() === "Y",
      });
    }
    this.formularies.set(id, drugs);
  }
}

class Tally {
  covered = 0;
  pa = 0;
  st = 0;
  ql = 0;
  ded = 0;
  tiers = new Map<number, number>();
  copays: number[] = [];
  coins: number[] = [];

  add(e: FormularyEntry, cost: TierCost | undefined): void {
    this.covered++;
    if (e.pa) this.pa++;
    if (e.st) this.st++;
    if (e.ql) this.ql++;
    this.tiers.set(e.tier, (this.tiers.get(e.tier) ?? 0) + 1);
    if (cost) {
      if (cost.deductibleApplies) this.ded++;
      (cost.type === "copay" ? this.copays : this.coins).push(cost.amount);
    }
  }

  pack(): PlanCoverage {
    const tier = [...this.tiers.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
    return [this.covered, tier, this.pa, this.st, this.ql, median(this.copays), median(this.coins), this.ded, this.copays.length, this.coins.length];
  }
}

export function median(xs: number[]): number {
  if (xs.length === 0) return -1;
  const s = [...xs].sort((a, b) => a - b);
  const m = s[Math.floor((s.length - 1) / 2)];
  return Math.round(m * 100) / 100;
}

/** Most insurers kept by name; the rest are grouped. */
const MAX_INSURERS = 24;
export const OTHER_INSURERS = "Other insurers";

/** Summarize coverage of every RxCUI across plans, by insurer and by state. */
export function summarizeCoverage(
  plans: Plan[],
  formularies: Map<string, Map<string, FormularyEntry>>,
  costs: Map<string, Map<number, TierCost>>,
  meta: { year: number; asOf: string; sourceUrl: string },
): PlanCoverageFile {
  const byInsurer = new Map<string, number>();
  for (const p of plans) byInsurer.set(p.insurer, (byInsurer.get(p.insurer) ?? 0) + 1);
  const named = [...byInsurer.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_INSURERS).map(([n]) => n);
  const insurers = [...named, OTHER_INSURERS];
  const namedIndex = new Map(named.map((n, i) => [n, i]));
  const insurerIndex = (p: Plan) => namedIndex.get(p.insurer) ?? named.length;
  const insurerPlans = insurers.map(() => 0);
  const stateNames = [...new Set(plans.flatMap((p) => [...p.states]))].sort();
  const stateIndex = new Map(stateNames.map((s, i) => [s, i]));
  const statePlans = stateNames.map(() => 0);
  for (const p of plans) {
    insurerPlans[insurerIndex(p)]++;
    for (const s of p.states) statePlans[stateIndex.get(s) as number]++;
  }

  const plansByFormulary = new Map<string, Plan[]>();
  for (const p of plans) plansByFormulary.set(p.formularyId, [...(plansByFormulary.get(p.formularyId) ?? []), p]);

  const all = new Map<string, Tally>();
  const perInsurer = new Map<string, Map<number, Tally>>();
  const perState = new Map<string, Map<number, number>>();
  for (const [fid, drugs] of formularies) {
    const users = plansByFormulary.get(fid);
    if (!users) continue;
    for (const [rxcui, e] of drugs) {
      const total = all.get(rxcui) ?? new Tally();
      const ins = perInsurer.get(rxcui) ?? new Map<number, Tally>();
      const st = perState.get(rxcui) ?? new Map<number, number>();
      for (const p of users) {
        const cost = costs.get(p.key)?.get(e.tier);
        total.add(e, cost);
        const i = insurerIndex(p);
        const t = ins.get(i) ?? new Tally();
        t.add(e, cost);
        ins.set(i, t);
        for (const s of p.states) {
          const si = stateIndex.get(s) as number;
          st.set(si, (st.get(si) ?? 0) + 1);
        }
      }
      all.set(rxcui, total);
      perInsurer.set(rxcui, ins);
      perState.set(rxcui, st);
    }
  }

  const drugs: PlanCoverageFile["drugs"] = {};
  for (const [rxcui, total] of all) {
    drugs[rxcui] = {
      all: total.pack(),
      insurers: [...(perInsurer.get(rxcui) ?? new Map<number, Tally>()).entries()].sort((a, b) => a[0] - b[0]).map(([i, t]) => [i, ...t.pack()]),
      states: [...(perState.get(rxcui) ?? new Map<number, number>()).entries()].sort((a, b) => a[0] - b[0]),
    };
  }
  return {
    ...meta,
    totalPlans: plans.length,
    insurers: insurers.map((name, i) => ({ name, plans: insurerPlans[i] })),
    states: stateNames.map((code, i) => ({ code, plans: statePlans[i] })),
    drugs,
  };
}
