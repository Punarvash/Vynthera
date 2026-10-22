import { isDemoMode } from "./http";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** AI features switch on only when a key is configured (and never in demo mode). */
export function claudeEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && !isDemoMode();
}

export function claudeModel(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}
