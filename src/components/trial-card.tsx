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
    </article>
  );
}
