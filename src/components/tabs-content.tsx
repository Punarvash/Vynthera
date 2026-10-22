import { ArticleCard } from "./article-card";
import { GradePill, LabelStatusBadge } from "./badges";
import { CopyCitationsButton } from "./copy-citations";
import { LetterGenerator, type LetterEvidence } from "./letter-generator";
import { ShowMore } from "./show-more";
import { SourceProblems } from "./source-problems";
import { TrialCard } from "./trial-card";
import { Card, SectionHeading, SourceLink } from "./ui";
import { DESIGN_LABEL } from "@/lib/design";
import { labelStatusText } from "@/lib/label-status";
import { loadCases, loadEvidence } from "@/lib/loaders";
import { truncate } from "@/lib/text";
import type { Article } from "@/lib/types";

function toCitation(a: Article): LetterEvidence {
  return {
    id: a.id,
    designLabel: DESIGN_LABEL[a.design],
    authors: a.authors,
    title: a.title,
    journal: a.journal,
    year: a.year,
    pmid: a.pmid,
    doi: a.doi,
    url: a.url,
    peerReviewed: a.peerReviewed,
  };
}

function FundingTally({ articles }: { articles: Article[] }) {
  const n = (k: Article["funding"]["kind"]) => articles.filter((a) => a.funding.kind === k).length;
  if (articles.length === 0) return null;
  return (
    <p className="text-muted">
      Funding: {n("industry")} industry-funded, {n("independent")} independent, {n("unreported")} not reported.
    </p>
  );
}

export async function EvidenceTab({ drug, condition }: { drug: string; condition?: string }) {
  const e = await loadEvidence(drug, condition);
  const topic = condition ? `${e.drug} for ${condition}` : e.drug;
  const approval =
    e.labelStatus.kind === "approved" || e.labelStatus.kind === "likely-approved"
      ? "approved"
      : e.labelStatus.kind === "off-label" || e.labelStatus.kind === "limitation"
        ? "off-label"
        : "unknown";

  return (
    <div className="space-y-8">
      <SourceProblems problems={e.problems} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Evidence on {topic}</h2>
        <LetterGenerator
          drug={e.drug}
          condition={condition}
          approval={approval}
          gradeLabel={e.grade.label}
          evidence={[...e.studies, ...e.preprints].slice(0, 15).map(toCitation)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading>Certainty of evidence (GRADE)</SectionHeading>
          <p className="mb-2">
            <GradePill level={e.grade.level} label={e.grade.label} />
          </p>
          <p className="mb-3">{e.grade.definition}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {e.grade.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {e.grade.notAssessed.length > 0 && (
            <details className="mt-3">
              <summary className="font-medium text-navy">What this rating does not cover</summary>
              <p className="mt-2 text-[0.95rem] text-muted">
                The rating is set automatically from study design. A full GRADE assessment also needs a reader to judge:
              </p>
              <ul className="mt-1 list-disc pl-5 text-[0.95rem] text-muted">
                {e.grade.notAssessed.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
        <Card>
          <SectionHeading>What is uncertain</SectionHeading>
          <ul className="list-disc space-y-1.5 pl-5">
            {e.uncertainty.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <SectionHeading action={<LabelStatusBadge status={e.labelStatus} />}>FDA approval status</SectionHeading>
        <p>{labelStatusText(e.labelStatus, e.drug, condition)}</p>
        {e.label && (
          <>
            <details className="mt-3">
              <summary className="font-medium text-navy">Read the approved indications</summary>
              <p className="mt-2 whitespace-pre-line text-[0.95rem]">{truncate(e.label.indications, 2500)}</p>
            </details>
            <p className="mt-2 text-sm text-muted">
              Source: <SourceLink href={e.label.dailyMedUrl}>DailyMed label</SourceLink>
              {e.label.effectiveDate ? `, version dated ${e.label.effectiveDate}` : ""}.
            </p>
          </>
        )}
      </Card>

      <section aria-labelledby="studies-heading">
        <h3 id="studies-heading" className="text-xl font-semibold">
          Published studies
        </h3>
        <p className="mb-1 text-muted">
          MEDLINE-indexed meta-analyses, trials and observational studies, strongest design first.
          {e.totalStudies > e.studies.length ? ` Showing the ${e.studies.length} most relevant of ${e.totalStudies.toLocaleString("en-US")}.` : ""}
        </p>
        <FundingTally articles={e.studies} />
        <div className="mt-3">
          {e.studies.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface p-4">No MEDLINE-indexed clinical studies were found for {topic}.</p>
          ) : (
            <ShowMore items={e.studies.map((a) => <ArticleCard key={a.id} article={a} />)} noun="studies" />
          )}
        </div>
      </section>

      <section aria-labelledby="trials-heading">
        <h3 id="trials-heading" className="text-xl font-semibold">
          Registered clinical trials
        </h3>
        <p className="mb-3 text-muted">
          From ClinicalTrials.gov. Funding is labelled from each trial&apos;s lead sponsor.
          {e.totalTrials > e.trials.length ? ` Showing ${e.trials.length} of ${e.totalTrials.toLocaleString("en-US")}.` : ""}
        </p>
        {e.trials.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface p-4">No registered trials were found for {topic}.</p>
        ) : (
          <ShowMore items={e.trials.map((t) => <TrialCard key={t.nctId} trial={t} />)} noun="trials" />
        )}
      </section>

      {e.preprints.length > 0 && (
        <section aria-labelledby="preprints-heading">
          <h3 id="preprints-heading" className="text-xl font-semibold">
            Preprints
          </h3>
          <p className="mb-3 text-muted">Not yet peer reviewed, and not counted in the certainty rating.</p>
          <ShowMore items={e.preprints.map((a) => <ArticleCard key={a.id} article={a} />)} initial={2} noun="preprints" />
        </section>
      )}
    </div>
  );
}

export async function CasesTab({ drug, condition }: { drug: string; condition?: string }) {
  const c = await loadCases(drug, condition);
  const topic = condition ? `${c.drug} for ${condition}` : c.drug;
  const all = [...c.cases, ...c.preprints];
  return (
    <div className="space-y-6">
      <SourceProblems problems={c.problems} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Published cases: {topic}</h2>
          <p className="text-muted">
            Case reports from MEDLINE-indexed journals{condition ? ", matching this drug and condition" : ""}. Case reports
            describe single patients and cannot show cause and effect.
            {c.totalCases > c.cases.length ? ` Showing ${c.cases.length} of ${c.totalCases.toLocaleString("en-US")}.` : ""}
          </p>
        </div>
        <CopyCitationsButton citations={all.map(toCitation)} />
      </div>
      <FundingTally articles={c.cases} />
      {c.cases.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-4">
          No published case reports were found for {topic}.
          {condition ? " Try searching the drug without a condition to see all of its case reports." : ""}
        </p>
      ) : (
        <ShowMore items={c.cases.map((a) => <ArticleCard key={a.id} article={a} />)} noun="cases" />
      )}
      {c.preprints.length > 0 && (
        <section aria-labelledby="case-preprints">
          <h3 id="case-preprints" className="text-xl font-semibold">
            Case preprints
          </h3>
          <p className="mb-3 text-muted">Not yet peer reviewed.</p>
          <ShowMore items={c.preprints.map((a) => <ArticleCard key={a.id} article={a} />)} initial={2} noun="preprints" />
        </section>
      )}
    </div>
  );
}

const COMING: Record<string, { title: string; items: string[]; sources: string }> = {
  specialists: {
    title: "Specialists",
    items: [
      "Verified physicians by specialty and location",
      "Self-reported experience treating patients with this drug",
      "Contact details so you can reach them directly",
    ],
    sources: "NPPES NPI Registry, plus physician profiles on Vynthera",
  },
};

export function ComingSoonTab({ tab }: { tab: keyof typeof COMING }) {
  const c = COMING[tab];
  return (
    <Card>
      <h2 className="text-2xl font-semibold">{c.title}</h2>
      <p className="mt-1 text-muted">This tab is planned for the next build, after the Evidence and Cases tabs are reviewed.</p>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        {c.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">Data sources: {c.sources}.</p>
    </Card>
  );
}
