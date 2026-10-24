import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { claudeEnabled, claudeModel } from "./claude";
import { truncate } from "./text";
import type { Article } from "./types";

const AssessSchema = z.object({
  studies: z.array(
    z.object({
      id: z.string(),
      direction: z
        .enum(["favors", "neutral", "against", "unclear"])
        .describe("favors: the main result favours the drug; neutral: no meaningful difference; against: favours the comparison or shows harm."),
      participants: z.number().int().nullable().describe("Total participants if the abstract states it, else null."),
    }),
  ),
});

const SYSTEM = `You read clinical study abstracts and record, for each one, the direction of its main result for a named drug.
Judge only from the abstract text given. If the drug is only a comparator, judge the result for the named drug.
Use "unclear" when the abstract does not report a result for the drug.`;

interface StudyInput {
  id: string;
  text: string;
}

async function callClaude(drug: string, condition: string, studies: StudyInput[]) {
  "use cache";
  cacheLife("days");
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: claudeModel(),
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(AssessSchema) },
    messages: [
      {
        role: "user",
        content: `Drug: ${drug}\nCondition: ${condition}\n\n${studies.map((s) => `[${s.id}]\n${s.text}`).join("\n\n")}`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`No assessment returned (stop reason: ${response.stop_reason})`);
  }
  return response.parsed_output.studies;
}

/**
 * Direction of effect (and stated participant counts) for each study, read by Claude.
 * Returns null without an API key or on failure, so the page still works and says the domain is not assessed.
 */
export async function assessDirections(
  drug: string,
  condition: string,
  studies: Article[],
): Promise<Map<string, { direction: Article["direction"]; participants: number | null }> | null> {
  if (!claudeEnabled() || studies.length === 0) return null;
  const input = studies.slice(0, 15).map((a) => ({
    id: a.id,
    text: `${a.title}\n${truncate(a.abstract, 1500)}`,
  }));
  try {
    const out = await callClaude(drug, condition, input);
    const known = new Set(input.map((s) => s.id));
    return new Map(out.filter((s) => known.has(s.id)).map((s) => [s.id, { direction: s.direction, participants: s.participants }]));
  } catch (err) {
    console.error("Study assessment failed", err);
    return null;
  }
}

const IndicationSchema = z.object({
  covered: z.boolean().describe("True only if the indications approve the drug for this condition or a category that clearly includes it."),
  quote: z.string().describe("The exact words from the indications that cover the condition, copied verbatim; empty if not covered."),
});

const INDICATION_SYSTEM = `You check whether an FDA label's Indications and Usage section approves a drug for a condition.
Count a condition as covered when the label names it, a synonym, or a category that clearly includes it (for example "infections of the ear, nose, and throat" covers otitis media).
Text under "Limitations of Use", or uses the label says are not established, do not count. Quote the covering words exactly as written.`;

async function callClaudeIndication(drug: string, condition: string, indications: string) {
  "use cache";
  cacheLife("days");
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: claudeModel(),
    max_tokens: 1000,
    system: INDICATION_SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(IndicationSchema) },
    messages: [{ role: "user", content: `Drug: ${drug}\nCondition: ${condition}\n\nIndications and Usage:\n${truncate(indications, 8000)}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`No indication check returned (stop reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/**
 * Claude's reading of whether the label's indications cover a condition, for wording that text
 * matching misses. Returns the covering quote only when it appears verbatim in the label; null otherwise.
 */
export async function indicationQuote(drug: string, condition: string, indications: string): Promise<string | null> {
  if (!claudeEnabled() || !indications) return null;
  try {
    const out = await callClaudeIndication(drug, condition, indications);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const quote = out.quote.trim();
    return out.covered && quote.length > 3 && norm(indications).includes(norm(quote)) ? quote : null;
  } catch (err) {
    console.error("Indication check failed", err);
    return null;
  }
}
