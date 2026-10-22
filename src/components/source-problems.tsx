import { AlertCircle } from "lucide-react";
import type { SourceProblem } from "@/lib/types";

/** Tell the physician exactly which source is missing, instead of silently showing less. */
export function SourceProblems({ problems }: { problems: SourceProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-[#f0d58a] bg-[#fff8e5] px-4 py-3 text-[#5c4300]">
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle aria-hidden className="size-4" /> Some data sources are unavailable right now
      </p>
      <ul className="mt-1 list-disc pl-6">
        {problems.map((p) => (
          <li key={p.source}>
            {p.source} is not responding right now, so its results are missing below. Try again in a few minutes.
          </li>
        ))}
      </ul>
    </div>
  );
}
