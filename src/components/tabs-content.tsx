import { ArrowDownCircle, CheckCircle2, MinusCircle } from "lucide-react";
import { ArticleCard } from "./article-card";
import { EvidencePyramid, PublicationTimeline } from "./evidence-charts";
import { InfoTip } from "./info-tip";
import { StudyList } from "./study-list";
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
import { PAGE_SIZE } from "@/lib/evidence";
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

const DOMAIN_STYLE = {
  "no-concern": { icon: CheckCircle2, tone: "text-[#1d5b36]", text: "No serious concern" },
  downgraded: { icon: ArrowDownCircle, tone: "text-[#8a1c12]", text: "Lowered one level" },
  "not-assessed": { icon: MinusCircle, tone: "text-muted", text: "Not assessed" },
} as const;

export async function EvidenceTab({ drug, condition }: { drug: string; condition?: string }) {
  const e = await loadEvidence(drug, condition);
  const topic = condition ? `${e.drug} for ${condition}` : e.drug;
  const approval =
    e.labelStatus.kind === "approved" || e.labelStatus.kind === "likely-approved"
      ? "approved"
      : e.labelStatus.kind === "off-label" || e.labelStatus.kind === "limitation"
        ? "off-label"
        : "unknown";
  const mainStudies = e.studies.filter((a) => a.aboutDrug);

  return (
    <div className="space-y-8">
      <SourceProblems problems={e.problems} />

      <div>
        <h2 className="text-2xl font-semibold">Evidence on {topic}</h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border-l-4 border-gold bg-surface px-4 py-3 text-lg">
          <GradePill level={e.grade.level} label={e.grade.label} />
          <span>{e.verdict}</span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading>
            Certainty of evidence
            <InfoTip term="grade" label="GRADE" />
          </SectionHeading>
          <p className="mb-2 flex flex-wrap items-center gap-2">
            <GradePill level={e.grade.level} label={e.grade.label} />
            {e.grade.startLevel && e.grade.startLevel !== e.grade.level && (
              <span className="text-sm text-muted">Started at {e.grade.startLevel === "high" ? "High" : "Low"}</span>
            )}
          </p>
          <p className="mb-3">{e.grade.definition}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {e.grade.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {e.grade.domains.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 font-semibold">The five GRADE checks</h4>
              <ul className="space-y-2">
                {e.grade.domains.map((d) => {
                  const st = DOMAIN_STYLE[d.status];
                  return (
                    <li key={d.name} className="flex gap-2">
                      <st.icon aria-hidden className={`mt-1 size-4 shrink-0 ${st.tone}`} />
                      <span>
                        <span className="font-medium">{d.name}:</span> <span className="sr-only">{st.text}. </span>
                        <span className={d.status === "downgraded" ? "font-medium text-[#8a1c12]" : ""}>{d.reason}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-sm text-muted">
                Checks are made automatically from abstracts, trial registries and funding records{e.aiAssessed ? ", with AI reading each abstract for its direction of effect" : ""}. Verify against the studies.
              </p>
            </div>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <EvidencePyramid counts={e.counts} full={e.countsAreFull} />
        </Card>
        {e.profile && Object.keys(e.profile.byYear).length > 0 && (
          <Card>
            <PublicationTimeline byYear={e.profile.byYear} total={e.profile.total} sampled={e.profile.sampled} />
          </Card>
        )}
      </div>

      <Card>
        <SectionHeading action={<LabelStatusBadge status={e.labelStatus} />}>
          FDA approval status
          <InfoTip term="offLabel" label="off-label" />
        </SectionHeading>
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
              {e.synonyms.length > 0 && " Synonyms of the condition from MeSH were also checked."}
            </p>
          </>
        )}
      </Card>

      <section aria-labelledby="studies-heading">
        <h3 id="studies-heading" className="text-xl font-semibold">
          Published studies
          <InfoTip term="medline" label="MEDLINE" />
        </h3>
        <p className="mb-1 text-muted">
          Meta-analyses, trials and observational studies from MEDLINE-indexed journals. Retracted papers are excluded. Studies
          that only mention the drug are marked and not counted in the rating.
        </p>
        <FundingTally articles={mainStudies.length ? mainStudies : e.studies} />
        <div className="mt-3">
          {e.studies.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface p-4">No MEDLINE-indexed clinical studies were found for {topic}.</p>
          ) : (
            <StudyList initial={e.studies} total={e.totalStudies} drug={e.drug} condition={condition} pageSize={PAGE_SIZE} />
          )}
        </div>
      </section>

      <section aria-labelledby="trials-heading">
        <h3 id="trials-heading" className="text-xl font-semibold">
          Registered clinical trials
        </h3>
        <p className="mb-3 text-muted">
          From ClinicalTrials.gov, completed trials with posted results first. Funding is labelled from each trial&apos;s lead
          sponsor.
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
            <InfoTip term="preprint" label="a preprint" />
          </h3>
          <p className="mb-3 text-muted">Not yet peer reviewed, and not counted in the certainty rating.</p>
          <ShowMore items={e.preprints.map((a) => <ArticleCard key={a.id} article={a} />)} initial={2} noun="preprints" />
        </section>
      )}

      <Card className="no-print">
        <SectionHeading action={
          <LetterGenerator
            drug={e.drug}
            condition={condition}
            approval={approval}
            gradeLabel={e.grade.label}
            evidence={[...mainStudies, ...e.studies.filter((a) => !a.aboutDrug), ...e.preprints].slice(0, 15).map(toCitation)}
          />
        }>
          Appealing a coverage denial?
        </SectionHeading>
        <p className="text-muted">
          Create a letter of medical necessity pre-filled with this evidence. Patient details stay in your browser.
        </p>
      </Card>
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
