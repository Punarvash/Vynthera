// Pure parsing helpers for the weekly cost import. No network or file access here, so they are unit-tested.
import type { NadacRow, PartDRow } from "../../src/lib/cost-data.ts";

/** Split one CSV line, honouring quoted fields and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** True when a line ends inside an open quoted field (the record continues on the next line). */
export function endsInsideQuotes(line: string): boolean {
  let quoted = false;
  for (const ch of line) if (ch === '"') quoted = !quoted;
  return quoted;
}

export function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** "01/15/2025", "2025-01-15" or "2025-01-15T00:00:00" -> "2025-01-15". */
export function toIsoDate(s: string | undefined): string {
  if (!s) return "";
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : "";
}

export function toNumber(s: string | undefined): number {
  if (!s) return NaN;
  return Number(s.replace(/[$,%\s]/g, ""));
}

interface NadacLatest {
  description: string;
  price: number;
  unit: string;
  effective: string;
  asOf: string;
  cls: string;
  otc: string;
}

/**
 * Accumulates NADAC rows (one weekly file has every NDC; a yearly dataset repeats them weekly)
 * and keeps the most recent price per NDC, then one row per NDC description.
 */
export class NadacAccumulator {
  private byNdc = new Map<string, NadacLatest>();
  private cols: Record<string, number> = {};
  latestAsOf = "";

  setHeader(header: string[]): void {
    const names = header.map(normalizeHeader);
    const find = (...candidates: string[]) => names.findIndex((n) => candidates.includes(n));
    this.cols = {
      description: find("ndc_description"),
      ndc: find("ndc"),
      price: find("nadac_per_unit", "nadac_unit_price"),
      effective: find("effective_date"),
      unit: find("pricing_unit"),
      otc: find("otc"),
      cls: find("classification_for_rate_setting"),
      asOf: find("as_of_date"),
    };
    const missing = ["description", "ndc", "price", "effective"].filter((k) => this.cols[k] < 0);
    if (missing.length) throw new Error(`NADAC file is missing columns: ${missing.join(", ")} (got ${names.join(", ")})`);
  }

  add(fields: string[]): void {
    const c = this.cols;
    const ndc = fields[c.ndc]?.trim();
    const price = toNumber(fields[c.price]);
    if (!ndc || !Number.isFinite(price)) return;
    const row: NadacLatest = {
      description: (fields[c.description] ?? "").trim().toUpperCase(),
      price,
      unit: (c.unit >= 0 ? fields[c.unit] : "EA")?.trim() || "EA",
      effective: toIsoDate(fields[c.effective]),
      asOf: c.asOf >= 0 ? toIsoDate(fields[c.asOf]) : "",
      cls: c.cls >= 0 ? (fields[c.cls] ?? "").trim().charAt(0).toUpperCase() : "",
      otc: c.otc >= 0 ? (fields[c.otc] ?? "").trim().charAt(0).toUpperCase() : "",
    };
    if (row.asOf > this.latestAsOf) this.latestAsOf = row.asOf;
    const prev = this.byNdc.get(ndc);
    if (!prev || `${row.asOf}|${row.effective}` >= `${prev.asOf}|${prev.effective}`) this.byNdc.set(ndc, row);
  }

  /** One row per NDC description, using the most recent price. */
  rows(): NadacRow[] {
    const byDesc = new Map<string, NadacLatest>();
    for (const r of this.byNdc.values()) {
      const prev = byDesc.get(r.description);
      if (!prev || `${r.asOf}|${r.effective}` > `${prev.asOf}|${prev.effective}`) byDesc.set(r.description, r);
    }
    return [...byDesc.values()]
      .sort((a, b) => a.description.localeCompare(b.description))
      .map((r) => [r.description, Math.round(r.price * 100000) / 100000, r.unit, r.effective, r.cls, r.otc]);
  }
}

/** Parse "Medicare Part D Spending by Drug": keep the all-manufacturer ("Overall") rows for the latest year. */
export function parsePartD(header: string[], records: string[][]): { year: number; rows: PartDRow[] } {
  const names = header.map((h) => h.replace(/^﻿/, "").trim());
  const years = names.map((n) => n.match(/^Tot_Spndng_(\d{4})$/)?.[1]).filter((y): y is string => Boolean(y)).map(Number);
  if (years.length === 0) throw new Error(`Part D file has no Tot_Spndng_YYYY columns (got ${names.slice(0, 12).join(", ")})`);
  const year = Math.max(...years);
  const col = (n: string) => names.indexOf(n);
  const idx = {
    brand: col("Brnd_Name"),
    generic: col("Gnrc_Name"),
    mftrs: col("Tot_Mftr"),
    mftr: col("Mftr_Name"),
    spend: col(`Tot_Spndng_${year}`),
    units: col(`Tot_Dsg_Unts_${year}`),
    claims: col(`Tot_Clms_${year}`),
    benes: col(`Tot_Benes_${year}`),
    perUnit: col(`Avg_Spnd_Per_Dsg_Unt_Wghtd_${year}`),
    perClaim: col(`Avg_Spnd_Per_Clm_${year}`),
    perBene: col(`Avg_Spnd_Per_Bene_${year}`),
    change: names.findIndex((n) => /^Chg_Avg_Spnd_Per_Dsg_Unt_\d{2}_\d{2}$/.test(n)),
  };
  const rows: PartDRow[] = [];
  for (const f of records) {
    if (idx.mftr >= 0 && f[idx.mftr]?.trim() !== "Overall") continue;
    const spending = toNumber(f[idx.spend]);
    if (!Number.isFinite(spending)) continue;
    const change = idx.change >= 0 ? toNumber(f[idx.change]) : NaN;
    rows.push({
      brand: f[idx.brand]?.trim() ?? "",
      generic: f[idx.generic]?.trim() ?? "",
      manufacturers: toNumber(f[idx.mftrs]) || 0,
      totalSpending: spending,
      claims: toNumber(f[idx.claims]) || 0,
      beneficiaries: toNumber(f[idx.benes]) || 0,
      dosageUnits: toNumber(f[idx.units]) || 0,
      avgPerUnit: toNumber(f[idx.perUnit]) || 0,
      avgPerClaim: toNumber(f[idx.perClaim]) || 0,
      avgPerBeneficiary: toNumber(f[idx.perBene]) || 0,
      changePerUnit: Number.isFinite(change) ? change : undefined,
    });
  }
  return { year, rows };
}

interface CatalogDistribution {
  title?: string;
  format?: string;
  mediaType?: string;
  downloadURL?: string;
  accessURL?: string;
  temporal?: string;
  modified?: string;
}

interface CatalogDataset {
  title?: string;
  modified?: string;
  temporal?: string;
  distribution?: CatalogDistribution[];
}

function yearIn(s: string | undefined): number {
  const years = (s ?? "").match(/\b(19|20)\d{2}\b/g)?.map(Number) ?? [];
  return years.length ? Math.max(...years) : 0;
}

/** Most recent dataset whose title matches, e.g. the newest "NADAC (National Average Drug Acquisition Cost) 2026". */
export function pickDataset(datasets: CatalogDataset[], title: RegExp): CatalogDataset | undefined {
  return datasets
    .filter((d) => d.title && title.test(d.title))
    .sort((a, b) => yearIn(b.title) - yearIn(a.title) || (b.modified ?? "").localeCompare(a.modified ?? ""))[0];
}

/** The newest CSV download among a dataset's distributions. */
export function pickCsv(d: CatalogDataset): CatalogDistribution | undefined {
  const csv = (d.distribution ?? []).filter(
    (x) => x.downloadURL && (/csv/i.test(x.mediaType ?? "") || /csv/i.test(x.format ?? "") || /\.csv(\?|$)/i.test(x.downloadURL)),
  );
  return csv.sort((a, b) => yearIn(b.title ?? b.temporal) - yearIn(a.title ?? a.temporal) || (b.modified ?? "").localeCompare(a.modified ?? ""))[0];
}

/** The newest data API endpoint among a data.cms.gov dataset's distributions. */
export function pickApi(d: CatalogDataset): CatalogDistribution | undefined {
  const apis = (d.distribution ?? []).filter((x) => x.accessURL && /data-api\/v1\/dataset\/[^/]+\/data/.test(x.accessURL));
  return apis.sort((a, b) => yearIn(b.title ?? b.temporal) - yearIn(a.title ?? a.temporal) || (b.modified ?? "").localeCompare(a.modified ?? ""))[0];
}
