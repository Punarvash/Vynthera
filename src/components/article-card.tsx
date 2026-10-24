import { DesignBadge, FundingBadge, PreprintBadge } from "./badges";
import { BookOpenCheck, Quote, Users } from "lucide-react";
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
        {a.cochrane && <Badge tone="approved"><BookOpenCheck aria-hidden className="size-3.5" /> Cochrane review</Badge>}
        {a.peerReviewed && !a.aboutDrug && (
          <Badge tone="caution" title="The drug is mentioned but is not a main subject of this study, so it is not counted in the certainty rating">
            Mentions the drug only
          </Badge>
        )}
        {a.direction && a.direction !== "unclear" && <DirectionBadge direction={a.direction} />}
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
      {(a.sampleSize || a.citations !== undefined) && (
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
          {a.sampleSize && (
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden className="size-3.5" /> {a.sampleSize.toLocaleString("en-US")} participants
            </span>
          )}
          {a.citations !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Quote aria-hidden className="size-3.5" /> Cited {a.citations.toLocaleString("en-US")} times
            </span>
          )}
        </p>
      )}
      {a.funding.reason && <p className="mt-1 text-sm text-muted">Funding: {a.funding.reason}.</p>}
      {(a.fundingStatement || a.coiStatement) && (
        <details className="mt-1 text-sm">
          <summary className="font-medium text-navy">Funding and conflicts of interest (full text)</summary>
          {a.fundingStatement && <p className="mt-1"><span className="font-medium">Funding: </span>{a.fundingStatement}</p>}
          {a.coiStatement && <p className="mt-1"><span className="font-medium">Conflicts: </span>{a.coiStatement}</p>}
        </details>
      )}
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

const DIRECTION = {
  favors: { tone: "independent", text: "Favours the drug" },
  neutral: { tone: "neutral", text: "No clear difference" },
  against: { tone: "offlabel", text: "Favours the comparison" },
} as const;

function DirectionBadge({ direction }: { direction: "favors" | "neutral" | "against" }) {
  const d = DIRECTION[direction];
  return (
    <Badge tone={d.tone} title="Direction of the main result, read from the abstract by AI. Verify in the study.">
      {d.text}
    </Badge>
  );
}
