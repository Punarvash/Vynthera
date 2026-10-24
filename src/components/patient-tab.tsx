import { AlertTriangle, CheckCircle2, MinusCircle, ShieldAlert } from "lucide-react";
import { AiBadge, GradePill, LabelStatusBadge } from "./badges";
import { PatientViews } from "./patient-views";
import { SourceProblems } from "./source-problems";
import { Card, SectionHeading, SourceLink } from "./ui";
import { loadPatientInfo } from "@/lib/loaders";
import { truncate } from "@/lib/text";
import type { LabelTable } from "@/lib/types";

/** A long label section: the opening shown, the rest one click away. */
export function LongText({ text, preview = 600 }: { text: string; preview?: number }) {
  if (text.length <= preview + 100) return <p className="whitespace-pre-line">{text}</p>;
  return (
    <details>
      <summary className="list-none">
        <p>{truncate(text, preview)}</p>
        <span className="font-medium text-navy underline">Show full section</span>
      </summary>
      <p className="mt-2 whitespace-pre-line">{text}</p>
    </details>
  );
}

function LabelTableView({ table }: { table: LabelTable }) {
  const [head, ...body] = table.rows;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-[0.95rem]">
        {table.caption && <caption className="p-3 text-left font-medium">{table.caption}</caption>}
        <thead className="bg-cream">
          <tr>
            {head.map((c, i) => (
              <th key={i} scope="col" className="border-b border-line px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="odd:bg-surface even:bg-[#fdfbf7]">
              {row.map((c, i) => (
                <td key={i} className="border-b border-line px-3 py-1.5 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function List({ items, icon: Icon, tone }: { items: string[]; icon: typeof CheckCircle2; tone: string }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <Icon aria-hidden className={`mt-1 size-5 shrink-0 ${tone}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export async function PatientTab({ drug, condition }: { drug: string; condition?: string }) {
  const { evidence: e, medline, plain, problems } = await loadPatientInfo(drug, condition);
  const l = e.label;
  const drugName = e.drug.charAt(0).toUpperCase() + e.drug.slice(1);
  const count = (...designs: string[]) => e.studies.filter((a) => designs.includes(a.design)).length;
  const dailyMed = l && <SourceLink href={l.dailyMedUrl}>FDA label on DailyMed</SourceLink>;

  const physician = (
    <div className="space-y-5">
      {!l && (
        <Card>
          <p>No FDA label was found for {drugName}, so dosage, side effects and toxicology are not available.</p>
        </Card>
      )}
      {l?.boxedWarning && (
        <Card className="border-[#efb1aa] bg-[#fdf3f2]">
          <SectionHeading>
            <span className="flex items-center gap-2 text-[#8a1c12]">
              <ShieldAlert aria-hidden className="size-5" /> Boxed warning
            </span>
          </SectionHeading>
          <LongText text={l.boxedWarning} />
        </Card>
      )}
      {l?.mechanism && (
        <Card>
          <SectionHeading>Mechanism of action</SectionHeading>
          <LongText text={l.mechanism} />
          <p className="mt-2 text-sm text-muted">Source: {dailyMed}</p>
        </Card>
      )}
      {l?.dosage && (
        <Card>
          <SectionHeading>Dosage and administration</SectionHeading>
          <LongText text={l.dosage} />
          <p className="mt-2 text-sm text-muted">Source: {dailyMed}</p>
        </Card>
      )}
      {(l?.adverseTable || l?.adverseReactions) && (
        <Card>
          <SectionHeading>Side effects and how often they occur</SectionHeading>
          {l.adverseTable && <LabelTableView table={l.adverseTable} />}
          {l.adverseReactions && (
            <div className={l.adverseTable ? "mt-4" : ""}>
              <LongText text={l.adverseReactions} preview={l.adverseTable ? 300 : 700} />
            </div>
          )}
          <p className="mt-2 text-sm text-muted">Source: {dailyMed}, Adverse Reactions section.</p>
        </Card>
      )}
      {(l?.warnings || l?.contraindications) && (
        <Card>
          <SectionHeading>Warnings and contraindications</SectionHeading>
          {l.contraindications && (
            <div className="mb-3">
              <h4 className="font-semibold">Contraindications</h4>
              <LongText text={l.contraindications} preview={400} />
            </div>
          )}
          {l.warnings && (
            <div>
              <h4 className="font-semibold">Warnings and precautions</h4>
              <LongText text={l.warnings} />
            </div>
          )}
        </Card>
      )}
      <Card>
        <SectionHeading>Clinical trials and meta-analyses</SectionHeading>
        <p>
          Among the most relevant MEDLINE studies{condition ? ` for ${condition}` : ""}:{" "}
          {plural(count("meta-analysis", "systematic-review"), "meta-analysis or systematic review", "meta-analyses or systematic reviews")},{" "}
          {plural(count("rct"), "randomized trial")} and {plural(count("clinical-trial", "observational"), "other study", "other studies")}.{" "}
          {plural(e.totalTrials, "registered trial")} on ClinicalTrials.gov.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          Certainty: <GradePill level={e.grade.level} label={e.grade.label} />{" "}
          <span className="text-muted">Details and sources are on the Evidence tab.</span>
        </p>
      </Card>
      <Card>
        <SectionHeading>Animal safety and toxicity data</SectionHeading>
        {l?.toxicology ? (
          <>
            <LongText text={l.toxicology} preview={500} />
            <p className="mt-2 text-sm text-muted">Source: {dailyMed}, Nonclinical Toxicology section.</p>
          </>
        ) : (
          <p className="text-muted">The FDA label for this drug has no nonclinical toxicology section.</p>
        )}
      </Card>
    </div>
  );

  const patient = (
    <article className="space-y-5">
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-3xl font-semibold">
            {drugName}
            {condition ? ` for ${condition}` : ""}
          </h3>
          {plain.mode === "ai" && <AiBadge>AI-written in plain language, checked against the sources below</AiBadge>}
        </div>
        {condition && (
          <p className="mb-3">
            <LabelStatusBadge status={e.labelStatus} />
          </p>
        )}
        <h4 className="text-lg font-semibold">What it is for</h4>
        <p>{plain.whatItIsFor}</p>
        {plain.howItWorks && (
          <>
            <h4 className="mt-3 text-lg font-semibold">How it works</h4>
            <p>{plain.howItWorks}</p>
          </>
        )}
        {plain.howToTake && (
          <>
            <h4 className="mt-3 text-lg font-semibold">How to take it</h4>
            <p>{plain.howToTake}</p>
          </>
        )}
        {plain.whatToExpect && (
          <>
            <h4 className="mt-3 text-lg font-semibold">What to expect</h4>
            <p>{plain.whatToExpect}</p>
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <SectionHeading>Benefits</SectionHeading>
          <List items={plain.benefits} icon={CheckCircle2} tone="text-[#1d5b36]" />
        </Card>
        <Card>
          <SectionHeading>Risks</SectionHeading>
          <List items={[...plain.commonSideEffects, ...plain.seriousRisks]} icon={AlertTriangle} tone="text-[#8a1c12]" />
        </Card>
        <Card>
          <SectionHeading>Drawbacks</SectionHeading>
          <List items={plain.drawbacks} icon={MinusCircle} tone="text-[#6b4e00]" />
        </Card>
      </div>

      {medline.length > 0 && (
        <Card>
          <SectionHeading>Learn more from MedlinePlus</SectionHeading>
          {medline.slice(0, 2).map((m) => (
            <div key={m.url} className="mb-3 last:mb-0">
              <p className="font-semibold">
                <SourceLink href={m.url}>{m.title}</SourceLink>
              </p>
              {m.summary && <p className="mt-1">{truncate(m.summary, 500)}</p>}
            </div>
          ))}
          <p className="text-sm text-muted">MedlinePlus is the U.S. National Library of Medicine&apos;s health site for patients.</p>
        </Card>
      )}

      <Card>
        <SectionHeading>Questions to ask your doctor</SectionHeading>
        <ul className="list-disc space-y-1 pl-5">
          {plain.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Card>

      <p className="text-sm text-muted">
        This handout is general information, not medical advice. Follow your doctor&apos;s instructions about your dose.
      </p>
    </article>
  );

  return (
    <div>
      <SourceProblems problems={problems} />
      <h2 className="mb-4 text-2xl font-semibold">Patient information: {e.drug}</h2>
      <PatientViews physician={physician} patient={patient} />
    </div>
  );
}
