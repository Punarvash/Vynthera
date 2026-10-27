import type { NextRequest } from "next/server";
import { suggest, type SuggestionKind } from "@/lib/suggest";

const KINDS: SuggestionKind[] = ["drug", "condition", "class", "pair"];

/** GET /api/suggest?q=albut&kind=drug,condition — typo-tolerant search suggestions for the search boxes. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const kinds = (request.nextUrl.searchParams.get("kind") ?? "").split(",").filter((k): k is SuggestionKind => KINDS.includes(k as SuggestionKind));
  try {
    const suggestions = await suggest(q, kinds.length ? kinds : ["drug", "condition", "class"]);
    return Response.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    console.error("Suggestions failed", err);
    return Response.json({ suggestions: [] });
  }
}
