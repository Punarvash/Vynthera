import { FundingBadge } from "./badges";
import { Badge, SourceLink } from "./ui";
import { trialFunding } from "@/lib/funding";
import { formatPhase, formatStatus } from "@/lib/sources/clinicaltrials";
import type { Trial } from "@/lib/types";

export function TrialCard({ trial: t }: { trial: Trial }) {
  const phase = formatPhase(t.phases);
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap gap-2">
        <Badge tone="neutral">{formatStatus(t.status)}</Badge>
        {phase && <Badge tone="neutral">{phase}</Badge>}
        {t.hasResults && <Badge tone="approved">Results posted</Badge>}
        <FundingBadge funding={trialFunding(t)} />
      </div>
      <h4 className="font-semibold leading-snug">
        <SourceLink href={t.url}>{t.title}</SourceLink>
      </h4>
      <p className="mt-1 text-muted">
        {[t.nctId, `Sponsor: ${t.sponsor}`, t.enrollment ? `${t.enrollment.toLocaleString("en-US")} participants` : "", t.startDate ? `Started ${t.startDate}` : ""]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {t.result && (
        <div className="mt-3 rounded-md border border-line bg-cream/60 p-3 text-[0.95rem]">
          <p className="font-semibold">Primary outcome: {t.result.title}</p>
          {t.result.timeFrame && <p className="text-sm text-muted">Time frame: {t.result.timeFrame}</p>}
          {t.result.groups.some((g) => g.value) && (
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="pr-3 font-medium">Group</th>
                  <th scope="col" className="pr-3 font-medium">Participants</th>
                  <th scope="col" className="font-medium">Result{t.result.unit ? ` (${t.result.unit})` : ""}</th>
                </tr>
              </thead>
              <tbody>
                {t.result.groups.map((g) => (
                  <tr key={g.title} className="border-t border-line">
                    <td className="py-1 pr-3">{g.title}</td>
                    <td className="py-1 pr-3 tabular-nums">{g.participants ?? "–"}</td>
                    <td className="py-1 tabular-nums">{g.value || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {t.result.pValue && <p className="mt-1 text-sm">p = {t.result.pValue}</p>}
          <p className="mt-1 text-xs text-muted">Posted results from ClinicalTrials.gov. Open the trial for all outcomes.</p>
        </div>
      )}
    </article>
  );
}
