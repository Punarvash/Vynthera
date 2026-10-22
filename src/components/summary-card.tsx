import { AiBadge, GradePill, LabelStatusBadge } from "./badges";
import { Card, SourceLink } from "./ui";
import { labelStatusText } from "@/lib/label-status";
import { loadEvidence, loadOverview, loadSummary } from "@/lib/loaders";
import { firstSentences, truncate } from "@/lib/text";

function Tile({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-cream/60 p-4">
      <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-gold-text">{heading}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** Key takeaways, scannable in about ten seconds. */
export async function SummaryCard({ drug, condition }: { drug: string; condition?: string }) {
  const [overview, evidence] = await Promise.all([loadOverview(drug), loadEvidence(drug, condition)]);
  const { label, mechanisms } = overview;
  const classes = label ? [...label.pharmClassEpc, ...label.pharmClassMoa].map((c) => c.replace(/\s*\[(EPC|MoA)\]$/, "")) : [];
  const targetLine = mechanisms
    .slice(0, 2)
    .map((m) => m.mechanismOfAction)
    .join("; ");

  return (
    <Card aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="sr-only">
        Summary
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile heading="Mechanism">
          {classes.length > 0 && <p className="font-semibold">{[...new Set(classes)].join(", ")}</p>}
          {targetLine && <p>{targetLine}</p>}
          {label?.mechanism && <p className="text-[0.95rem] text-muted">{truncate(firstSentences(label.mechanism, 1), 180)}</p>}
          {!classes.length && !targetLine && !label?.mechanism && <p className="text-muted">Mechanism not available.</p>}
          {label && (
            <p className="text-sm">
              <SourceLink href={label.dailyMedUrl}>FDA label</SourceLink>
            </p>
          )}
        </Tile>
        <Tile heading="Evidence strength">
          <p>
            <GradePill level={evidence.grade.level} label={evidence.grade.label} />
          </p>
          <p className="text-[0.95rem] text-muted">GRADE certainty, based on study design.</p>
          <p className="text-sm">
            <a href="#drug-tabs" className="font-medium text-navy underline">
              See studies
            </a>
          </p>
        </Tile>
        <Tile heading="Cost range">
          <p className="text-muted">Coming with the Costs tab, using CMS and NADAC public pricing.</p>
        </Tile>
        <Tile heading="Off-label status">
          <p>
            <LabelStatusBadge status={evidence.labelStatus} />
          </p>
          <p className="text-[0.95rem] text-muted">{labelStatusText(evidence.labelStatus, evidence.drug, condition)}</p>
        </Tile>
      </div>
    </Card>
  );
}

export async function AiSummary({ drug, condition }: { drug: string; condition?: string }) {
  const summary = await loadSummary(drug, condition);
  if (summary.findings.length === 0 && summary.mode === "extractive") return null;
  return (
    <Card aria-labelledby="ai-summary-heading" className="border-sand">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-summary-heading" className="text-lg font-semibold">
          What the evidence says
        </h2>
        {summary.mode === "ai" ? <AiBadge /> : <AiBadge>Automated summary quoted from abstracts</AiBadge>}
      </div>
      {summary.mode === "ai" && <p className="mb-3 text-lg font-medium">{summary.bottomLine}</p>}
      <ul className="list-disc space-y-2 pl-5">
        {summary.findings.map((f, i) => (
          <li key={i}>
            {f.text}{" "}
            {f.sources.map((s) => (
              <SourceLink key={s.id} href={s.url} className="mr-2 text-sm">
                {s.label}
              </SourceLink>
            ))}
          </li>
        ))}
      </ul>
      {summary.mode === "ai" ? (
        <p className="mt-3 text-muted">
          <span className="font-medium text-ink">Limitations: </span>
          {summary.limitations}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">{summary.note}</p>
      )}
      <details className="mt-3">
        <summary className="font-medium text-navy">How this summary was made</summary>
        <p className="mt-2 text-[0.95rem] text-muted">
          {summary.mode === "ai"
            ? "Claude read the abstracts of the top studies and the FDA label shown on this page, and wrote this summary using only those sources. Findings it could not tie to a source were removed. Open each linked study to verify."
            : "These are the authors' own conclusions, quoted from the highest-ranked study abstracts. Open each linked study to read it in full."}
        </p>
      </details>
    </Card>
  );
}
