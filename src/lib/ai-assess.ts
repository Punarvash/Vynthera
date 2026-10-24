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
