import { normalizeForMatch } from "./text";

/**
 * Many labels, antibiotics especially, approve a drug for a body site or category of
 * infection ("Infections of the Ear, Nose, and Throat") rather than naming each condition
 * ("otitis media", "strep throat"). Each entry maps the conditions a clinician types to the
 * wording such labels use.
 */
interface Category {
  /** What the label wording covers, for the explanation shown to the user. */
  name: string;
  /** Matches the condition as typed or one of its synonyms (normalized: lowercase words). */
  condition: RegExp;
  /** Label wording, normalized, any of which means the label covers the condition. */
  label: string[];
}

const CATEGORIES: Category[] = [
  {
    name: "ear infections",
    condition: /\b(otitis|ear infections?|middle ear|swimmer s ear)\b/,
    label: ["infections of the ear", "ear nose and throat", "ear nose throat", "otitis media", "otitis externa", "acute otitis"],
  },
  {
    name: "throat infections",
    condition: /\b(pharyngitis|tonsillitis|tonsillopharyngitis|strep throat|sore throat|throat infections?)\b/,
    label: ["ear nose and throat", "ear nose throat", "pharyngitis", "tonsillitis", "tonsillopharyngitis", "infections of the throat"],
  },
  {
    name: "sinus infections",
    condition: /\b(sinusitis|rhinosinusitis|sinus infections?)\b/,
    label: ["sinusitis", "ear nose and throat", "ear nose throat", "rhinosinusitis"],
  },
  {
    name: "lower respiratory tract infections",
    condition: /\b(pneumonia|bronchitis|lower respiratory|chest infections?|lrti|cap)\b/,
    label: ["lower respiratory tract", "pneumonia", "bronchitis", "respiratory tract infections"],
  },
  {
    name: "upper respiratory tract infections",
    condition: /\b(upper respiratory|urti)\b/,
    label: ["upper respiratory tract", "respiratory tract infections"],
  },
  {
    name: "urinary tract infections",
    condition: /\b(uti|utis|urinary tract infections?|cystitis|pyelonephritis|bladder infections?|kidney infections?)\b/,
    label: ["urinary tract", "genitourinary tract", "genitourinary infections", "cystitis", "pyelonephritis"],
  },
  {
    name: "skin and soft tissue infections",
    condition: /\b(cellulitis|impetigo|erysipelas|skin infections?|skin and soft tissue|soft tissue infections?|wound infections?|abscess(es)?|ssti|absssi)\b/,
    label: ["skin and skin structure", "skin structure", "skin and soft tissue", "cellulitis", "impetigo", "erysipelas"],
  },
  {
    name: "Helicobacter pylori infection",
    condition: /\b(h pylori|helicobacter|pylori)\b/,
    label: ["helicobacter pylori", "h pylori"],
  },
  {
    name: "bone and joint infections",
    condition: /\b(osteomyelitis|septic arthritis|bone infections?|joint infections?)\b/,
    label: ["bone and joint", "bone infections", "osteomyelitis", "septic arthritis"],
  },
  {
    name: "intra-abdominal infections",
    condition: /\b(intra ?abdominal|peritonitis|appendicitis)\b/,
    label: ["intra abdominal", "intraabdominal", "peritonitis"],
  },
  {
    name: "bloodstream infections",
    condition: /\b(sepsis|septicemia|bacteremia|bloodstream infections?)\b/,
    label: ["septicemia", "bacteremia", "bloodstream infections"],
  },
  {
    name: "gonorrhea",
    condition: /\b(gonorrh(o)?ea|gonococcal)\b/,
    label: ["gonorrhea", "gonococcal", "neisseria gonorrhoeae"],
  },
];

/**
 * When the label approves a category that includes the condition, the label wording that
 * covers it and the category's name; otherwise undefined.
 */
export function coveringCategory(indicatedText: string, phrases: string[]): { wording: string; category: string } | undefined {
  const text = ` ${normalizeForMatch(indicatedText)} `;
  const conditions = phrases.map((p) => ` ${normalizeForMatch(p)} `);
  for (const c of CATEGORIES) {
    if (!conditions.some((p) => c.condition.test(p))) continue;
    const wording = c.label.find((l) => text.includes(` ${l} `));
    if (wording) return { wording, category: c.name };
  }
  return undefined;
}
