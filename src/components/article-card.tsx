import { DesignBadge, FundingBadge, PreprintBadge } from "./badges";
import { Badge, SourceLink } from "./ui";
import type { Article } from "@/lib/types";

export function ArticleCard({ article, manufacturerLinked }: { article: Article; manufacturerLinked?: boolean }) {
  const a = article;
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap gap-2">
        <DesignBadge design={a.design} inferred={a.designInferred} />
        {!a.peerReviewed && <PreprintBadge />}
        <FundingBadge funding={a.funding} />
        {manufacturerLinked && (
          <Badge tone="industry" title="Author affiliation or funding linked to the manufacturer">
            Manufacturer research
          </Badge>
        )}
      </div>
      <h4 className="font-semibold leading-snug">
        <SourceLink href={a.url}>{a.title}</SourceLink>
      </h4>
      <p className="mt-1 text-muted">
        {[a.authors, a.journal, a.year].filter(Boolean).join(" · ")}
        {a.pmid ? ` · PMID ${a.pmid}` : ""}
      </p>
      {a.funding.reason && <p className="mt-1 text-sm text-muted">Funding: {a.funding.reason}.</p>}
      {a.conclusion && (
        <p className="mt-2">
          <span className="font-medium">Authors&apos; conclusion: </span>
          {a.conclusion}
        </p>
      )}
      {a.abstract && (
        <details className="mt-2">
          <summary className="font-medium text-navy">Show abstract</summary>
          <p className="mt-2 whitespace-pre-line text-[0.95rem]">{a.abstract}</p>
        </details>
      )}
    </article>
  );
}
