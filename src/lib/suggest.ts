import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { abbreviationSynonyms } from "./condition-synonyms";
import { loadCostFiles } from "./costs";
import { getJson, isDemoMode } from "./http";
import { baseDrugName } from "./sources/openfda";

/** "pair" is a drug plus a condition typed together ("metformin pcos" -> "Metformin for Polycystic ovary syndrome"). */
export type SuggestionKind = "drug" | "condition" | "class" | "pair";

export interface Suggestion {
  label: string;
  kind: SuggestionKind;
  /** Extra context, e.g. the generic name behind a brand ("Glucophage" -> "metformin"). */
  hint?: string;
}

interface IndexEntry extends Suggestion {
  norm: string;
  words: string[];
  /** Popularity, for ranking near-ties (Medicare patients for drugs). */
  weight: number;
}

/** Common drug classes, in the words clinicians search with, mapped to FDA class names where they differ. */
const CLASSES: [string, string?][] = [
  ["GLP-1 receptor agonist"], ["SGLT2 inhibitor"], ["DPP-4 inhibitor"], ["Statin", "HMG-CoA reductase inhibitor"], ["ACE inhibitor", "angiotensin converting enzyme inhibitor"],
  ["Angiotensin receptor blocker", "angiotensin 2 receptor blocker"], ["Beta blocker", "beta adrenergic blocker"], ["Calcium channel blocker"], ["Proton pump inhibitor"],
  ["SSRI", "serotonin reuptake inhibitor"], ["SNRI", "serotonin and norepinephrine reuptake inhibitor"], ["Benzodiazepine"], ["Opioid agonist"], ["TNF blocker", "tumor necrosis factor blocker"],
  ["JAK inhibitor", "janus kinase inhibitor"], ["Factor Xa inhibitor"], ["Anticoagulant"], ["Corticosteroid"], ["Bisphosphonate"], ["Loop diuretic"], ["Thiazide diuretic"],
  ["Sulfonylurea"], ["Insulin"], ["PD-1 blocker", "programmed death receptor-1 blocking antibody"], ["Antihistamine", "histamine-1 receptor antagonist"],
  ["Cephalosporin", "cephalosporin antibacterial"], ["Penicillin", "penicillin-class antibacterial"], ["Macrolide", "macrolide antimicrobial"], ["Fluoroquinolone", "fluoroquinolone antibacterial"],
  ["Tetracycline", "tetracycline-class drug"], ["Antiviral"], ["Atypical antipsychotic"], ["Anticonvulsant"], ["Triptan", "serotonin-1b and serotonin-1d receptor agonist"],
  ["CGRP antagonist", "calcitonin gene-related peptide receptor antagonist"], ["Bronchodilator"], ["Leukotriene receptor antagonist"], ["Aromatase inhibitor"], ["5-alpha reductase inhibitor"],
];

/** Everyday condition names used when the condition list has not been imported yet. */
const COMMON_CONDITIONS = [
  "Hypertension", "Type 2 diabetes mellitus", "Type 1 diabetes mellitus", "Hyperlipidemia", "Asthma", "Chronic obstructive pulmonary disease", "Heart failure", "Atrial fibrillation",
  "Coronary artery disease", "Depression", "Generalized anxiety disorder", "Bipolar disorder", "Schizophrenia", "Attention deficit hyperactivity disorder", "Migraine", "Epilepsy",
  "Parkinson disease", "Alzheimer disease", "Multiple sclerosis", "Rheumatoid arthritis", "Osteoarthritis", "Psoriasis", "Psoriatic arthritis", "Atopic dermatitis", "Acne",
  "Crohn disease", "Ulcerative colitis", "Gastroesophageal reflux disease", "Irritable bowel syndrome", "Polycystic ovary syndrome", "Endometriosis", "Osteoporosis", "Hypothyroidism",
  "Hyperthyroidism", "Obesity", "Chronic kidney disease", "Urinary tract infection", "Strep throat", "Otitis media", "Sinusitis", "Pneumonia", "Bronchitis", "Cellulitis",
  "Influenza", "COVID-19", "HIV infection", "Hepatitis C", "Hepatitis B", "Lyme disease", "Gout", "Insomnia", "Allergic rhinitis", "Glaucoma", "Macular degeneration", "Keratoconus",
  "Erectile dysfunction", "Benign prostatic hyperplasia", "Overactive bladder", "Anemia", "Deep vein thrombosis", "Pulmonary embolism", "Stroke", "Breast cancer", "Prostate cancer",
  "Lung cancer", "Colorectal cancer", "Melanoma", "Leukemia", "Lymphoma", "Multiple myeloma", "Chronic pain", "Fibromyalgia", "Opioid use disorder", "Alcohol use disorder",
  "Smoking cessation", "Hidradenitis suppurativa", "Lupus", "Ankylosing spondylitis", "Sickle cell disease", "Cystic fibrosis", "Idiopathic pulmonary fibrosis", "Pulmonary hypertension",
];

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent swaps), stopping early past `max`. */
export function editDistance(a: string, b: string, max = 4): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many typos to forgive for a query of this length. */
function allowed(len: number): number {
  return len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3;
}

/** 0–100 match score of a query against an entry; 0 means no match. */
export function matchScore(q: string, e: { norm: string; words: string[] }): number {
  if (!q) return 0;
  if (e.norm === q) return 100;
  if (e.norm.startsWith(q)) return 95 - Math.min(10, (e.norm.length - q.length) / 3);
  if (e.words.some((w) => w.startsWith(q))) return 85;
  if (q.length >= 4 && e.norm.includes(q)) return 75;
  const max = allowed(q.length);
  if (max === 0) return 0;
  // Typed so far may be a misspelled beginning ("albutr" -> "albuterol"), or the whole word misspelled.
  const prefix = editDistance(q, e.norm.slice(0, q.length), max);
  const whole = editDistance(q, e.norm, max);
  const word = Math.min(...e.words.map((w) => Math.min(editDistance(q, w, max), editDistance(q, w.slice(0, q.length), max))));
  const d = Math.min(prefix, whole, word);
  return d <= max ? 70 - d * 12 : 0;
}

let index: Promise<IndexEntry[]> | null = null;

/** Drop abbreviated salt and form words that drug lists append ("Albuterol Sul", "Metformin Hcl Er"). */
function tidy(name: string): string {
  return baseDrugName(name.trim())
    .replace(/\s+(sul|sulf|phos|phosp|pot|potass|sod|hfa|hcl|er|xr|dr|sr|tr|odt|mag|cal|fum|tart|mal|succ|bes|mes|ac|osmotic|gastric)\b.*$/i, "")
    .trim();
}

/** Supplies and devices that share the drug lists but are not medicines. */
const SUPPLIES = /\b(needle|needles|syringe|syringes|lancet|lancets|strip|strips|supplies|supply|meter|test|swab|swabs|diabetic|kit|bandage|glucose monitor|sensor|insulin pen needle)\b/i;

function entry(label: string, kind: SuggestionKind, weight: number, hint?: string): IndexEntry {
  const norm = normalize(label);
  return { label, kind, hint, weight, norm, words: norm.split(" ") };
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** Drug names come from the weekly cost imports (every drug Medicare paid for or pharmacies stock); conditions from the imported list. */
function loadIndex(): Promise<IndexEntry[]> {
  index ??= (async () => {
    const { nadac, partD } = await loadCostFiles();
    const drugs = new Map<string, IndexEntry>();
    const add = (name: string, weight: number, hint?: string) => {
      const label = titleCase(tidy(name));
      const key = normalize(label);
      if (key.length < 3 || /\d/.test(key)) return;
      const prev = drugs.get(key);
      const cleanHint = hint && !/[/,]/.test(hint) && normalize(tidy(hint)) !== key ? tidy(hint) : undefined;
      if (!prev || weight > prev.weight) drugs.set(key, entry(label, "drug", weight, cleanHint ?? prev?.hint));
    };
    // Popularity by ingredient (Medicare patients), so "albut" ranks albuterol above rarer products.
    const popularity = new Map<string, number>();
    for (const r of partD.rows) {
      const key = normalize(baseDrugName(r.generic)).split(" ")[0];
      popularity.set(key, (popularity.get(key) ?? 0) + r.beneficiaries);
    }
    const weightOf = (name: string) => popularity.get(normalize(name).split(" ")[0]) ?? 1;
    // Generic names from NADAC product descriptions, which are written in full ("ALBUTEROL SULFATE HFA 90 MCG").
    for (const [desc] of nadac.rows) {
      const name = desc.match(/^([A-Z][A-Z' -]*?[A-Z])(?=\s+(?:\d|HCL|ER|XR|DR|SR|ODT|EC|HBR)|$)/)?.[1];
      if (name && !SUPPLIES.test(name)) add(baseDrugName(name), weightOf(name));
    }
    // Brand names from Medicare Part D (its generic names are abbreviated, e.g. "Amoxicillin/ Clav").
    for (const r of partD.rows) {
      if (normalize(tidy(r.brand)) === normalize(tidy(baseDrugName(r.generic))) || SUPPLIES.test(r.brand)) continue;
      add(r.brand.replace(/[*(].*$/, ""), r.beneficiaries, baseDrugName(r.generic));
    }
    // Ingredients only in Part D (specialty drugs) are added when the name is not abbreviated.
    for (const r of partD.rows) {
      const g = baseDrugName(r.generic);
      if (!/[\/,]/.test(g) && !SUPPLIES.test(g) && g.split(" ").every((w) => w.length > 4 || /^(and|of)$/.test(w))) add(g, r.beneficiaries);
    }
    let conditions: string[] = COMMON_CONDITIONS;
    if (!isDemoMode()) {
      try {
        const file = JSON.parse(await readFile(path.join(process.cwd(), "data", "search", "conditions.json"), "utf8")) as { names: string[] };
        conditions = [...new Set([...file.names, ...COMMON_CONDITIONS])];
      } catch {
        // Not imported yet; the built-in list is used.
      }
    }
    const conditionEntries = conditions.map((c) => entry(c, "condition", COMMON_CONDITIONS.includes(c) ? 1000 : 10));
    const classEntries = CLASSES.map(([label, fda]) => entry(label, "class", 500, fda));
    return [...drugs.values(), ...conditionEntries, ...classEntries];
  })();
  return index;
}

interface Approximate {
  approximateGroup?: { candidate?: { rxcui?: string; name?: string; score?: string }[] };
}

/** RxNorm's typo-tolerant drug name matching, reduced to ingredient-level names. */
async function rxnormApproximate(q: string): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const data = await getJson<Approximate>("RxNorm", `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=8`, {
    timeoutMs: 2500,
    quiet: true,
  });
  const names = (data.approximateGroup?.candidate ?? [])
    .map((c) => c.name?.match(/^[A-Za-z][A-Za-z' -]*?(?=\s+\d|\s*\[|$)/)?.[0]?.trim())
    .filter((n): n is string => Boolean(n) && !(n as string).includes(" / "));
  return [...new Set(names.map((n) => baseDrugName(n)))].slice(0, 5);
}

/** NLM Clinical Tables condition search (consumer and clinical names). */
async function clinicalTablesConditions(q: string): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const data = await getJson<[number, string[], unknown, string[][]]>(
    "NLM Clinical Tables",
    `https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(q)}&df=consumer_name&maxList=6`,
    { timeoutMs: 2500, quiet: true },
  );
  return (data[3] ?? []).map((r) => r[0]).filter(Boolean);
}

/**
 * Suggestions for what the user is typing, typo-tolerant. The local index answers instantly;
 * RxNorm and NLM Clinical Tables add drugs and conditions it does not know.
 */
const FORM_OR_SALT = /^(er|xr|sr|dr|xl|cr|la|odt|hcl|hfa|sulfate|sodium|potassium|calcium|tablets?|tabs?|caps?|capsules?|mg|mcg|inhaler|injection|injectable|pen|cream|gel|solution|suspension|oral|topical|extended|delayed|\d)/;

/** While typing "metformin pc…": the drug typed so far, paired with conditions that match the rest. */
async function pairSuggestions(raw: string, limit: number): Promise<Suggestion[]> {
  const words = raw.trim().split(/\s+/);
  for (let i = words.length - 1; i >= 1; i--) {
    const rest = words.slice(i).join(" ").replace(/^(for|in|with|to treat|treating)\s+/i, "");
    const r = normalize(rest);
    // The rest must look like a condition, not a strength or form ("metformin er", "albuterol sulfate").
    if (r.length < 3 || /^(for|in|with|to|treat|treating)$/.test(r) || FORM_OR_SALT.test(r)) continue;
    const drug = await namedEntry(words.slice(0, i).join(" "), "drug");
    if (!drug) continue;
    const all = await loadIndex();
    const conditions = [
      ...abbreviationSynonyms(rest).slice(0, 1).map((c) => titleCase(c)),
      ...all
        .filter((e) => e.kind === "condition")
        .map((e) => ({ e, s: matchScore(r, e) }))
        .filter((x) => x.s >= 75)
        .sort((a, b) => b.s - a.s || b.e.weight - a.e.weight || a.e.norm.length - b.e.norm.length)
        .map((x) => x.e.label),
    ];
    const unique = [...new Set(conditions)].slice(0, limit);
    if (unique.length) return unique.map((c) => ({ label: `${drug} for ${c}`, kind: "pair" as const }));
  }
  return [];
}

export async function suggest(raw: string, kinds: SuggestionKind[] = ["drug", "condition", "class"], limit = 8): Promise<Suggestion[]> {
  const q = normalize(raw);
  if (q.length < 2) return [];
  if (kinds.includes("drug") && kinds.includes("condition") && q.includes(" ")) {
    const pairs = await pairSuggestions(raw, 4);
    if (pairs.length) {
      // The pairs first, then ordinary matches for the whole text in case it is one long name.
      const rest = await suggest(raw, kinds.filter((k) => k !== "drug" && k !== "pair"), limit - pairs.length);
      return [...pairs, ...rest].slice(0, limit);
    }
  }
  const all = await loadIndex();
  const scored = all
    .filter((e) => kinds.includes(e.kind))
    .map((e) => {
      const s = matchScore(q, e);
      // Popular drugs win near-ties; combinations sit just below single ingredients.
      const boost = s > 0 ? Math.log10(1 + e.weight) * 2 - (/[/]| and /.test(e.norm + e.label) ? 6 : 0) : 0;
      return { e, s, rank: s + boost };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.rank - a.rank || a.e.norm.length - b.e.norm.length);
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion) => {
    const k = normalize(s.label);
    if (seen.has(k) || out.length >= limit) return;
    seen.add(k);
    out.push(s);
  };
  // Abbreviations ("T2DM", "UTI") suggest the full condition name first.
  if (kinds.includes("condition")) for (const full of abbreviationSynonyms(raw).slice(0, 1)) push({ label: titleCase(full), kind: "condition", hint: raw.toUpperCase() });
  // With good matches, leave out the looser typo matches ("albut" does not need "Alburx").
  const strong = scored.filter((x) => x.s >= 75).length;
  for (const { e, s } of scored.slice(0, limit)) if (strong < 3 || s >= 75) push({ label: e.label, kind: e.kind, hint: e.hint });

  const weak = scored.length === 0 || scored[0].s < 85;
  if (weak && q.length >= 4 && !isDemoMode()) {
    const [drugs, conditions] = await Promise.all([
      kinds.includes("drug") ? rxnormApproximate(q).catch(() => []) : Promise.resolve([]),
      kinds.includes("condition") ? clinicalTablesConditions(q).catch(() => []) : Promise.resolve([]),
    ]);
    for (const d of drugs) push({ label: titleCase(d), kind: "drug" });
    for (const c of conditions) push({ label: c, kind: "condition" });
  }
  return out;
}

/** The single most likely intended term, for "Did you mean …?" (only when it differs from what was typed). */
export async function didYouMean(raw: string): Promise<Suggestion | null> {
  const q = normalize(raw);
  const [best] = await suggest(raw, ["drug", "condition", "class"], 3);
  if (!best || normalize(best.label) === q) return null;
  return best;
}

/** The index entry a whole phrase names, allowing a small typo; null when nothing is close enough. */
async function namedEntry(text: string, kind: SuggestionKind): Promise<string | null> {
  const q = normalize(text);
  if (q.length < 2) return null;
  if (kind === "condition") {
    const full = abbreviationSynonyms(text)[0];
    if (full) return titleCase(full);
  }
  const typos = q.length >= 8 ? 2 : q.length >= 5 ? 1 : 0;
  let best: { label: string; d: number; weight: number } | null = null;
  for (const e of await loadIndex()) {
    if (e.kind !== kind) continue;
    // A condition named by its start ("polycystic ovary") also counts; drugs must be named in full.
    const d = e.norm === q ? 0 : kind === "condition" && q.length >= 8 && e.norm.startsWith(q) ? 0.5 : editDistance(q, e.norm, typos);
    if (d <= typos && (!best || d < best.d || (d === best.d && e.weight > best.weight))) best = { label: e.label, d, weight: e.weight };
  }
  return best?.label ?? null;
}

export interface QueryParts {
  drug?: string;
  condition?: string;
}

/**
 * One search box takes a drug, a condition, or both: "metformin pcos", "metformin for polycystic ovary syndrome"
 * and "PCOS metformin" all give drug metformin and condition polycystic ovary syndrome. Empty when the query
 * is not a drug-plus-condition pair.
 */
export async function splitQuery(raw: string): Promise<QueryParts> {
  const text = raw.trim();
  // A name that is itself one drug or condition ("insulin resistance") is not a pair.
  const q = normalize(text);
  if ((await loadIndex()).some((e) => e.norm === q)) return {};
  const joined = text.match(/^(.+?)\s+(?:for|in|to treat|treating|with)\s+(.+)$/i);
  const pairs: [string, string][] = [];
  if (joined) pairs.push([joined[1], joined[2]], [joined[2], joined[1]]);
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length && words.length <= 8; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    pairs.push([a, b], [b, a]);
  }
  for (const [d, c] of pairs) {
    const [drug, condition] = await Promise.all([namedEntry(d, "drug"), namedEntry(c, "condition")]);
    if (drug && condition) return { drug, condition };
  }
  return {};
}
