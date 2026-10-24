import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { DESIGN_LABEL } from "./design";
import { truncate } from "./text";
import type { EvidenceBundle } from "./evidence";
import { claudeEnabled, claudeModel } from "./claude";

export interface SummarySource {
  id: string;
  label: string;
  url: string;
}

export interface SummaryFinding {
  text: string;
  sources: SummarySource[];
}

export type EvidenceSummary =
  | { mode: "ai"; bottomLine: string; findings: SummaryFinding[]; limitations: string }
  | { mode: "extractive"; findings: SummaryFinding[]; note: string };

interface SourceForPrompt {
  id: string;
  label: string;
  url: string;
  text: string;
}

const SummarySchema = z.object({
  bottomLine: z.string().describe("One or two sentences a busy physician can read in 10 seconds."),
  keyFindings: z
    .array(
      z.object({
        text: z.string().describe("One finding, with effect direction and size as reported."),
        sourceIds: z.array(z.string()).describe("IDs such as S1 of the sources that support this finding."),
      }),
    )
    .describe("Three to five findings, strongest evidence first."),
  limitations: z.string().describe("One or two sentences on what the evidence cannot tell us."),
});

const SYSTEM = `You summarize published clinical evidence for physicians who are deciding whether to use a drug, often off-label.
Use only the numbered sources provided. Never add facts, doses or statistics that are not in them.
Every finding must cite the IDs of the sources it relies on. Report the direction and size of effects as the sources state them.
Say plainly when sources disagree, when results come from small or non-randomized studies, or when a source is a preprint that has not been peer reviewed.
Write in short, plain clinical English. Do not recommend a treatment decision; summarize what the evidence shows.
The certainty of evidence has been rated separately with GRADE and is given to you. Phrase the bottom line with GRADE's standard wording for that level:
High: "<drug> improves/reduces <outcome>"; Moderate: "<drug> probably improves…"; Low: "<drug> may improve…"; Very low: "It is very uncertain whether <drug> improves…".
If no certainty is given, describe the evidence without a certainty claim.`;

/** Studies where the drug is a main topic; all studies only if none qualify. */
function mainStudies(bundle: EvidenceBundle) {
  const main = bundle.studies.filter((a) => a.aboutDrug);
  return main.length ? main : bundle.studies;
}

function sourcesFor(bundle: EvidenceBundle): SourceForPrompt[] {
  const studies = [...mainStudies(bundle).slice(0, 12), ...bundle.preprints.filter((a) => a.aboutDrug).slice(0, 3)];
  const out: SourceForPrompt[] = studies.map((a, i) => ({
    id: `S${i + 1}`,
    label: `${a.authors.split(",")[0] || "Study"} ${a.year}`.trim(),
    url: a.url,
    text: [
      `${DESIGN_LABEL[a.design]}${a.peerReviewed ? "" : " (PREPRINT, not peer reviewed)"}; ${a.journal} ${a.year}`,
      `Funding: ${a.funding.kind === "industry" ? "industry" : a.funding.kind === "independent" ? "independent" : "not reported"}`,
      `Title: ${a.title}`,
      `Abstract: ${truncate(a.abstract, 1800)}`,
    ].join("\n"),
  }));
  if (bundle.label?.indications) {
    out.push({
      id: `S${out.length + 1}`,
      label: "FDA label",
      url: bundle.label.dailyMedUrl,
      text: `FDA label, Indications and Usage: ${truncate(bundle.label.indications, 1500)}`,
    });
  }
  return out;
}

/** Journal notices that some abstracts end with, e.g. "NO LEVEL ASSIGNED: This journal requires…". */
export const BOILERPLATE = /\b(LEVEL OF EVIDENCE|LEVEL ASSIGNED|EVIDENCE LEVEL)\b|this journal requires|copyright|all rights reserved|©/i;

/** The closing sentences of an abstract, where conclusions usually are. */
export function lastSentences(text: string, n: number): string {
  const sentences = (text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text]).filter((s) => !BOILERPLATE.test(s));
  return sentences.slice(-n).join("").trim();
}


function extractive(bundle: EvidenceBundle, note: string): EvidenceSummary {
  const drug = bundle.drug.toLowerCase();
  const ranked = [...mainStudies(bundle)].sort(
    (a, b) => Number(!a.title.toLowerCase().includes(drug)) - Number(!b.title.toLowerCase().includes(drug)),
  );
  const findings = ranked
    .filter((a) => a.conclusion || a.abstract)
    .slice(0, 4)
    .map((a) => ({
      text: truncate((a.conclusion && !BOILERPLATE.test(a.conclusion) ? a.conclusion : lastSentences(a.abstract, 2)) || a.title, 320),
      sources: [{ id: a.id, label: `${a.authors.split(",")[0] || "Study"} ${a.year}`.trim(), url: a.url }],
    }));
  return { mode: "extractive", findings, note };
}

async function callClaude(drug: string, condition: string | undefined, certainty: string, sources: SourceForPrompt[]) {
  "use cache";
  cacheLife("days");
  const client = new Anthropic();
  const topic = condition ? `${drug} for ${condition}` : drug;
  const response = await client.messages.parse({
    model: claudeModel(),
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(SummarySchema) },
    messages: [
      {
        role: "user",
        content: `Summarize the evidence on ${topic}.\nGRADE certainty: ${certainty}\n\n${sources.map((s) => `[${s.id}]\n${s.text}`).join("\n\n")}`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`No summary returned (stop reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/**
 * AI summary when an Anthropic API key is configured; otherwise the conclusions quoted
 * from the top study abstracts. Only public literature is sent to the model, never patient data.
 */
export async function summarizeEvidence(bundle: EvidenceBundle): Promise<EvidenceSummary> {
  if (bundle.studies.length === 0) {
    return extractive(bundle, "No peer-reviewed studies to summarize.");
  }
  if (!claudeEnabled()) {
    return extractive(bundle, "Conclusions quoted from the top study abstracts. AI summaries switch on once an Anthropic API key is added.");
  }
  const sources = sourcesFor(bundle);
  try {
    const certainty = ["high", "moderate", "low", "very-low"].includes(bundle.grade.level) ? bundle.grade.label : "not rated";
    const out = await callClaude(bundle.drug, bundle.condition, certainty, sources);
    const byId = new Map(sources.map((s) => [s.id, s]));
    const findings = out.keyFindings
      .map((f) => ({
        text: f.text,
        sources: f.sourceIds
          .map((id) => byId.get(id.trim()))
          .filter((s): s is SourceForPrompt => s !== undefined)
          .map(({ id, label, url }) => ({ id, label, url })),
      }))
      // A finding without a verifiable source is dropped rather than shown.
      .filter((f) => f.sources.length > 0);
    return { mode: "ai", bottomLine: out.bottomLine, findings, limitations: out.limitations };
  } catch (err) {
    console.error("AI summary failed", err);
    return extractive(bundle, "The AI summary is unavailable right now, so conclusions are quoted from the top study abstracts.");
  }
}
