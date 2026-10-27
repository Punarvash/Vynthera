// Splits an FDA Medication Guide or patient package insert (already written for patients) into the
// questions it answers, so the patient view can show each answer under a clear heading.

export type GuideKey =
  | "important"
  | "whatIs"
  | "whoShouldNot"
  | "beforeTaking"
  | "howToTake"
  | "avoid"
  | "sideEffects"
  | "storage"
  | "general"
  | "ingredients";

const HEADINGS: [GuideKey, RegExp][] = [
  ["important", /What is the most important information I should know about [^?]{1,80}\?/i],
  ["whoShouldNot", /(?:Who should not|Do not) (?:take|use|receive) [^?.:]{1,80}[?:]/i],
  ["beforeTaking", /(?:Before (?:taking|using|you take|you use|you start|receiving|you receive) [^,:]{1,80}[,:] tell your (?:healthcare provider|doctor)[^:.]{0,120}[:.]|What should I tell my (?:healthcare provider|doctor) before [^?]{1,80}\?)/i],
  ["howToTake", /How should I (?:take|use|receive|inject) [^?]{1,80}\?/i],
  ["avoid", /What should I avoid while (?:taking|using|receiving) [^?]{1,80}\?/i],
  ["sideEffects", /What are the (?:possible|most common) side effects of [^?]{1,80}\?/i],
  ["storage", /How should I store [^?]{1,80}\?/i],
  ["general", /General information about the safe and effective use of [^.]{1,80}\./i],
  ["ingredients", /What are the ingredients in [^?]{1,80}\?/i],
  // Last, because "What is X?" also starts the "most important information" heading.
  ["whatIs", /What is (?!the most important)[^?]{1,60}\?/i],
];

export type MedGuide = Partial<Record<GuideKey, string>>;

/** The text under each recognized heading, in the order they appear. */
export function parseMedGuide(text: string | undefined): MedGuide {
  if (!text) return {};
  const found: { key: GuideKey; start: number; end: number }[] = [];
  for (const [key, re] of HEADINGS) {
    // Guides cite their own headings ('See "What is the most important information…"'); a quoted match is a reference, not the heading.
    const all = new RegExp(re.source, "gi");
    for (const m of text.matchAll(all)) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 3), m.index);
      if (/["“'‘]\s*$/.test(before)) continue;
      const start = m.index ?? 0;
      if (!found.some((f) => start < f.end && start + m[0].length > f.start)) found.push({ key, start, end: start + m[0].length });
      break;
    }
  }
  found.sort((a, b) => a.start - b.start);
  const out: MedGuide = {};
  found.forEach((f, i) => {
    const body = text.slice(f.end, found[i + 1]?.start ?? text.length).trim();
    if (body) out[f.key] = body.replace(/\s+/g, " ");
  });
  return out;
}

/** Bulleted items in a section ("• nausea • vomiting"), or its sentences when it has no bullets. */
export function items(text: string | undefined, max = 10): string[] {
  if (!text) return [];
  const parts = text.includes("•") ? text.split("•").slice(1) : sentences(text);
  return parts
    .map((s) =>
      s
        // Drop cross-references to other parts of the guide.
        .replace(/See\s+["“][^"”]*["”]?\s*(for [^.]*\.)?/gi, "")
        .replace(/\s+/g, " ")
        .replace(/^[\s"”'’.,;:)•-]+/, "")
        .trim(),
    )
    .filter((s) => s.length > 3 && s.length < 400 && /[a-z]/i.test(s))
    .slice(0, max);
}

/** Sentences, split only where a capital letter follows, so "0.8 mL" and "2.1" stay whole. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=["“(]?[A-Z])/).filter((x) => x.trim());
}

export function sentencesMatching(text: string | undefined, re: RegExp, max = 3): string[] {
  if (!text) return [];
  return sentences(text)
    .map((s) => s.replace(/^[\s•"”-]+/, "").trim())
    .filter((s) => re.test(s))
    .slice(0, max);
}

const EMERGENCY = /\b(emergency|911|right away|immediately|trouble breathing|difficulty breathing|swelling of (?:your )?(?:face|lips|tongue|throat)|chest pain|faint|seizure|anaphyla|severe allergic|suicid)/i;

/**
 * Side effects split into "most common" and "serious" items, the serious ones further split into
 * those needing emergency help and those to report to the doctor.
 */
export function splitSideEffects(text: string | undefined): { common: string[]; call911: string[]; callDoctor: string[] } {
  if (!text) return { common: [], call911: [], callDoctor: [] };
  // The closing boilerplate ("These are not all the possible side effects...") is not a side effect.
  const body = text.split(/These are not all (?:of )?the possible side effects/i)[0];
  const [serious, common = ""] = body.split(/The most common side effects (?:of [^.:]{1,80})?(?:include|are)[^:]*:?/i);
  const seriousItems = items(serious, 14).filter((s) => !/^(These are not all|Call your doctor for medical advice|Tell your healthcare provider if you have any side effect)/i.test(s));
  return {
    common: items(common, 10).filter((s) => !/^(These are not all|Call your doctor|You may report)/i.test(s)).map((s) => s.replace(/\.$/, "")),
    call911: seriousItems.filter((s) => EMERGENCY.test(s)).slice(0, 6),
    callDoctor: seriousItems.filter((s) => !EMERGENCY.test(s)).slice(0, 8),
  };
}
