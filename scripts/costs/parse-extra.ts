// Pure parsers for the Part B, negotiated price, VA and NADAC history imports. Unit-tested; no I/O.
import type { NegotiatedRow, PartBLimit, PartBSpendingRow, TopEntry, TopPrescribersFile, VaRow } from "../../src/lib/cost-data.ts";
import { normalizeHeader, toIsoDate, toNumber } from "./parse.ts";

/** CMS CSVs start with title lines; the header is the first row whose first cell matches. */
export function findHeader(records: string[][], first: RegExp): number {
  return records.findIndex((r) => first.test((r[0] ?? "").trim()));
}

/** Part B payment limits joined with the NDC crosswalk's product names for each billing code. */
export function parsePartB(limits: string[][], crosswalk: string[][]): PartBLimit[] {
  const h = findHeader(limits, /^HCPCS Code$/i);
  if (h < 0) throw new Error("Part B payment limit file: header row not found");
  const cols = limits[h].map(normalizeHeader);
  const col = (n: string) => cols.indexOf(n);
  const [code, desc, dosage, limit, coins] = [col("hcpcs_code"), col("short_description"), col("hcpcs_code_dosage"), col("payment_limit"), col("co_insurance_percentage")];

  const names = new Map<string, Set<string>>();
  const ch = findHeader(crosswalk, /CODE$/i);
  if (ch >= 0) {
    const cc = crosswalk[ch].map(normalizeHeader);
    const [xCode, xName] = [0, cc.indexOf("drug_name")];
    for (const r of crosswalk.slice(ch + 1)) {
      const k = r[xCode]?.trim();
      const n = r[xName]?.trim();
      if (!k || !n) continue;
      const set = names.get(k) ?? new Set<string>();
      set.add(n.toLowerCase().replace(/\s+/g, " "));
      names.set(k, set);
    }
  }

  const out: PartBLimit[] = [];
  for (const r of limits.slice(h + 1)) {
    const hcpcs = r[code]?.trim();
    const value = toNumber(r[limit]);
    if (!hcpcs || !Number.isFinite(value)) continue;
    out.push({
      hcpcs,
      description: r[desc]?.trim() ?? "",
      dosage: r[dosage]?.trim() ?? "",
      limit: value,
      coinsurance: (toNumber(r[coins]) || 0) / 100,
      drugNames: [...(names.get(hcpcs) ?? [])].slice(0, 12),
    });
  }
  return out;
}

/** "Medicare Part B Spending by Drug": the latest year's spending per billing code. */
export function parsePartBSpending(header: string[], records: string[][]): { year: number; rows: PartBSpendingRow[] } {
  const names = header.map((h) => h.replace(/^﻿/, "").trim());
  const years = names.map((n) => n.match(/^Tot_Spndng_(\d{4})$/)?.[1]).filter((y): y is string => Boolean(y)).map(Number);
  if (years.length === 0) throw new Error(`Part B spending file has no Tot_Spndng_YYYY columns (got ${names.slice(0, 10).join(", ")})`);
  const year = Math.max(...years);
  const col = (n: string) => names.indexOf(n);
  const i = {
    hcpcs: col("HCPCS_Cd"),
    desc: col("HCPCS_Desc"),
    brand: col("Brnd_Name"),
    generic: col("Gnrc_Name"),
    spend: col(`Tot_Spndng_${year}`),
    claims: col(`Tot_Clms_${year}`),
    benes: col(`Tot_Benes_${year}`),
    unit: col(`Avg_Spndng_Per_Dsg_Unt_${year}`),
    claim: col(`Avg_Spndng_Per_Clm_${year}`),
    bene: col(`Avg_Spndng_Per_Bene_${year}`),
  };
  const rows: PartBSpendingRow[] = [];
  for (const f of records) {
    const spending = toNumber(f[i.spend]);
    if (!Number.isFinite(spending)) continue;
    rows.push({
      hcpcs: f[i.hcpcs]?.trim() ?? "",
      description: f[i.desc]?.trim() ?? "",
      // CMS marks names with "*" where several products share a code.
      brand: (f[i.brand] ?? "").replace(/\*$/, "").trim(),
      generic: (f[i.generic] ?? "").replace(/\*$/, "").trim(),
      totalSpending: spending,
      claims: toNumber(f[i.claims]) || 0,
      beneficiaries: toNumber(f[i.benes]) || 0,
      avgPerUnit: toNumber(f[i.unit]) || 0,
      avgPerClaim: toNumber(f[i.claim]) || 0,
      avgPerBeneficiary: toNumber(f[i.bene]) || 0,
    });
  }
  return { year, rows };
}

/** CMS negotiated price data file: one row per drug and price period (the file repeats it per NDC). */
export function parseNegotiated(header: string[], records: string[][]): NegotiatedRow[] {
  const cols = header.map(normalizeHeader);
  const col = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const i = {
    ipay: col(/^ipay$/),
    drug: col(/^selected_drug_name$/),
    ingredient: col(/^active_ingredient/),
    effective: col(/^mfp_effective_date$/),
    end: col(/^mfp_end_date$/),
    price: col(/^single_mfp_per_30/),
  };
  if (Object.values(i).some((x) => x < 0)) throw new Error(`Negotiated price file: unexpected columns ${cols.join(", ")}`);
  const seen = new Map<string, NegotiatedRow>();
  for (const f of records) {
    const price = toNumber(f[i.price]);
    if (!Number.isFinite(price)) continue;
    const row: NegotiatedRow = {
      ipay: Number(f[i.ipay]) || 0,
      drug: f[i.drug]?.trim() ?? "",
      ingredient: (f[i.ingredient] ?? "").trim().toLowerCase(),
      effective: toIsoDate(f[i.effective]),
      end: toIsoDate(f[i.end]),
      price30Day: price,
    };
    seen.set(`${row.drug}|${row.effective}`, row);
  }
  return [...seen.values()].sort((a, b) => a.drug.localeCompare(b.drug) || a.effective.localeCompare(b.effective));
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Shared strings of an .xlsx workbook (xl/sharedStrings.xml). */
export function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
}

/** Rows of an .xlsx worksheet as { column letter: text }. */
export function* sheetRows(xml: string, strings: string[]): Generator<Record<string, string>> {
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {};
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, colName, attrs, body = ""] = c;
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      cells[colName] = /t="s"/.test(attrs) && v !== undefined ? (strings[Number(v)] ?? "") : decodeXml(v ?? inline ?? "");
    }
    yield cells;
  }
}

/** Count in a VA package description: "30" -> 30 units, "15ML" -> 15 mL; otherwise one package. */
export function packageUnits(pkg: string): { count: number; unit: string } {
  const p = pkg.trim().toUpperCase();
  const n = p.match(/^(\d+(?:\.\d+)?)\s*(ML|GM|G)?$/);
  if (!n) return { count: 1, unit: "PKG" };
  return { count: Number(n[1]) || 1, unit: n[2] ? (n[2] === "ML" ? "ML" : "GM") : "EA" };
}

/**
 * VA Federal Supply Schedule price list: the lowest current price per unit for each product description.
 * Columns follow the header row (Generic, PackageDescription, Price, PriceStopDate, PriceType, TradeName).
 */
export function parseVaPrices(rows: Iterable<Record<string, string>>, asOf: string): VaRow[] {
  let cols: Record<string, string> | null = null;
  const best = new Map<string, VaRow>();
  for (const r of rows) {
    if (!cols) {
      cols = Object.fromEntries(Object.entries(r).map(([letter, name]) => [name.trim(), letter]));
      for (const k of ["Generic", "PackageDescription", "Price", "PriceType"]) if (!cols[k]) throw new Error(`VA price list is missing ${k}`);
      continue;
    }
    const desc = (r[cols.Generic] ?? "").trim().toUpperCase();
    const price = toNumber(r[cols.Price]);
    const stop = toIsoDate(r[cols.PriceStopDate]);
    if (!desc || !Number.isFinite(price) || price <= 0 || (stop && stop < asOf)) continue;
    const { count, unit } = packageUnits(r[cols.PackageDescription] ?? "");
    const perUnit = Math.round((price / count) * 100000) / 100000;
    const prev = best.get(desc);
    if (!prev || perUnit < prev[1]) best.set(desc, [desc, perUnit, unit, (r[cols.PriceType] ?? "").trim(), (r[cols.TradeName] ?? "").trim()]);
  }
  return [...best.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Collects NADAC rows into the median price per product description per month (latest survey of the month). */
export class NadacHistory {
  private byDesc = new Map<string, Map<string, { asOf: string; prices: number[] }>>();

  add(description: string, price: number, asOf: string): void {
    if (!asOf || !Number.isFinite(price)) return;
    const month = asOf.slice(0, 7);
    const months = this.byDesc.get(description) ?? new Map<string, { asOf: string; prices: number[] }>();
    const cur = months.get(month);
    if (!cur || asOf > cur.asOf) months.set(month, { asOf, prices: [price] });
    else if (asOf === cur.asOf) cur.prices.push(price);
    this.byDesc.set(description, months);
  }

  /** Monthly medians for the given descriptions over the most recent `count` months seen. */
  result(keep: Set<string>, count = 24): { months: string[]; rows: Record<string, (number | null)[]> } {
    const all = new Set<string>();
    for (const m of this.byDesc.values()) for (const k of m.keys()) all.add(k);
    const months = [...all].sort().slice(-count);
    const rows: Record<string, (number | null)[]> = {};
    for (const [desc, m] of this.byDesc) {
      if (!keep.has(desc)) continue;
      rows[desc] = months.map((k) => {
        const v = m.get(k);
        if (!v) return null;
        const s = [...v.prices].sort((a, b) => a - b);
        return Number(s[Math.floor((s.length - 1) / 2)].toPrecision(4));
      });
    }
    return { months, rows };
  }
}

function insertTop(list: TopEntry[], e: TopEntry, max: number): boolean {
  const i = list.findIndex((x) => x[0] === e[0]);
  if (i >= 0) {
    // Same prescriber seen again (rows out of order): add the claims together.
    list[i] = [e[0], list[i][1] + e[1], Math.max(list[i][2], e[2])];
  } else {
    if (list.length >= max && e[1] <= list[list.length - 1][1]) return false;
    list.push(e);
  }
  list.sort((a, b) => b[1] - a[1]);
  if (list.length > max) list.length = max;
  return true;
}

/**
 * Streams "Medicare Part D Prescribers - by Provider and Drug" (one row per prescriber, drug and brand)
 * and keeps the most experienced prescribers of each drug nationwide, overall and per specialty.
 */
export class TopPrescribers {
  private cols: Record<string, number> = {};
  private drugs = new Map<string, { all: TopEntry[]; types: Map<string, TopEntry[]> }>();
  private people = new Map<string, [string, string, string, string, string]>();

  /** `notOverall`: prescriber types left out of the overall list (they still count for their own type). */
  private types: Set<string>;
  private notOverall?: RegExp;
  private maxAll: number;
  private maxPerType: number;

  constructor(types: Set<string>, notOverall?: RegExp, maxAll = 15, maxPerType = 5) {
    this.types = types;
    this.notOverall = notOverall;
    this.maxAll = maxAll;
    this.maxPerType = maxPerType;
  }

  header(fields: string[]): void {
    const names = fields.map((f) => f.replace(/^﻿/, "").trim());
    for (const k of ["Prscrbr_NPI", "Prscrbr_Last_Org_Name", "Prscrbr_First_Name", "Prscrbr_City", "Prscrbr_State_Abrvtn", "Prscrbr_Type", "Gnrc_Name", "Tot_Clms", "Tot_Benes"]) {
      this.cols[k] = names.indexOf(k);
      if (this.cols[k] < 0) throw new Error(`Prescriber file is missing ${k}`);
    }
  }

  /** The file is grouped by prescriber: rows of the current one, totaled per drug over its brands. */
  private current = { npi: "", person: ["", "", "", "", ""] as [string, string, string, string, string], drugs: new Map<string, TopEntry>() };

  add(f: string[]): void {
    const c = this.cols;
    const npi = f[c.Prscrbr_NPI]?.trim();
    const generic = f[c.Gnrc_Name]?.trim();
    const claims = Number(f[c.Tot_Clms]) || 0;
    if (!npi || !generic || claims <= 0) return;
    if (npi !== this.current.npi) {
      this.flush();
      const type = f[c.Prscrbr_Type]?.trim() ?? "";
      this.current = { npi, person: [f[c.Prscrbr_First_Name]?.trim() ?? "", f[c.Prscrbr_Last_Org_Name]?.trim() ?? "", f[c.Prscrbr_City]?.trim() ?? "", f[c.Prscrbr_State_Abrvtn]?.trim() ?? "", type], drugs: new Map() };
    }
    const benes = Number(f[c.Tot_Benes]) || 0;
    const prev = this.current.drugs.get(generic);
    this.current.drugs.set(generic, prev ? [npi, prev[1] + claims, Math.max(prev[2], benes)] : [npi, claims, benes]);
  }

  private flush(): void {
    const { npi, person, drugs } = this.current;
    const type = person[4];
    for (const [generic, e] of drugs) {
      let d = this.drugs.get(generic);
      if (!d) {
        d = { all: [], types: new Map() };
        this.drugs.set(generic, d);
      }
      let kept = this.notOverall?.test(type) ? false : insertTop(d.all, [...e] as TopEntry, this.maxAll);
      if (this.types.has(type)) {
        const t = d.types.get(type) ?? [];
        kept = insertTop(t, [...e] as TopEntry, this.maxPerType) || kept;
        d.types.set(type, t);
      }
      if (kept && !this.people.has(npi)) this.people.set(npi, person);
    }
    drugs.clear();
  }

  result(year: number, sourceUrl: string): TopPrescribersFile {
    this.flush();
    const drugs: TopPrescribersFile["drugs"] = {};
    const used = new Set<string>();
    for (const [g, d] of this.drugs) {
      const types = Object.fromEntries([...d.types.entries()].filter(([, l]) => l.length));
      drugs[g] = { all: d.all, types };
      for (const e of d.all) used.add(e[0]);
      for (const l of Object.values(types)) for (const e of l) used.add(e[0]);
    }
    // Only prescribers that made a list (the NPI map collects some that were later pushed out).
    const people = Object.fromEntries([...this.people.entries()].filter(([npi]) => used.has(npi)));
    return { year, sourceUrl, people, drugs };
  }
}
