import {
  AlertTriangle,
  BarChart3,
  Car,
  ClipboardList,
  Users,
  Star,
  Stethoscope,
  Ban,
  Baby,
  Clock,
  DollarSign,
  ExternalLink,
  HeartPulse,
  HelpCircle,
  Info,
  ListChecks,
  Package,
  Phone,
  Pill,
  ShieldAlert,
  Siren,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { AiBadge, GradePill, LabelStatusBadge } from "./badges";
import { PatientViews } from "./patient-views";
import { SourceProblems } from "./source-problems";
import { Card, SectionHeading, SourceLink } from "./ui";
import { money } from "@/lib/costs";
import { loadPatientInfo } from "@/lib/loaders";
import { firstSentences, truncate } from "@/lib/text";
import type { LabelTable } from "@/lib/types";

/** Label cross-references ("( 2.1 )", "[see Warnings and Precautions ( 5.1 )]") help in the PDF, not on screen. */
export function tidyLabel(text: string): string {
  return text
    .replace(/\s*\[see [^\]]{1,160}\]/gi, "")
    .replace(/\s*\(\s*\d+(?:\.\d+)*(?:\s*,\s*\d+(?:\.\d+)*)*\s*\)/g, "")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A long label section: the opening shown, the rest one click away. */
export function LongText({ text: raw, preview = 600 }: { text: string; preview?: number }) {
  const text = tidyLabel(raw);
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

/** One collapsible label section in the physician view, linked from the contents list. */
function LabelSection({ id, title, open, tone, children }: { id: string; title: string; open?: boolean; tone?: "danger"; children: ReactNode }) {
  return (
    <details id={id} open={open} className={`scroll-mt-24 rounded-lg border p-4 ${tone === "danger" ? "border-[#efb1aa] bg-[#fdf3f2]" : "border-line bg-surface"}`}>
      <summary className={`cursor-pointer text-lg font-semibold ${tone === "danger" ? "text-[#8a1c12]" : ""}`}>{title}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function List({ items, icon: Icon, tone }: { items: string[]; icon: typeof Info; tone: string }) {
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

/** A numbered section of the patient handout with an icon, so it is easy to scan and to print. */
function Step({ n, icon: Icon, title, tone = "text-gold-text", children }: { n: number; icon: typeof Info; title: string; tone?: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-lg border border-line bg-surface p-5">
      <h4 className="mb-3 flex items-center gap-3 text-xl font-semibold">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cream text-base text-navy">{n}</span>
        <Icon aria-hidden className={`size-6 shrink-0 ${tone}`} />
        {title}
      </h4>
      <div className="space-y-2 text-[1.05rem] leading-relaxed">{children}</div>
    </section>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export async function PatientTab({ drug, condition }: { drug: string; condition?: string }) {
  const { evidence: e, medline, medlineEs, costs, plain, problems } = await loadPatientInfo(drug, condition);
  const l = e.label;
  const drugName = e.drug.charAt(0).toUpperCase() + e.drug.slice(1);
  const count = (...designs: string[]) => e.studies.filter((a) => designs.includes(a.design)).length;
  const dailyMed = l && <SourceLink href={l.dailyMedUrl}>FDA label on DailyMed</SourceLink>;
  const drugClass = l?.pharmClassEpc[0]?.replace(/\s*\[EPC\]$/, "");

  const sections: { id: string; title: string; show: boolean }[] = [
    { id: "pi-boxed", title: "Boxed warning", show: Boolean(l?.boxedWarning) },
    { id: "pi-uses", title: "Uses", show: Boolean(l?.indications) },
    { id: "pi-dosing", title: "Dosing", show: Boolean(l?.dosage) },
    { id: "pi-populations", title: "Specific populations", show: Boolean(l?.specificPopulations || l?.pregnancy || l?.lactation || l?.pediatricUse || l?.geriatricUse) },
    { id: "pi-contra", title: "Contraindications", show: Boolean(l?.contraindications) },
    { id: "pi-warnings", title: "Warnings", show: Boolean(l?.warnings) },
    { id: "pi-adverse", title: "Side effects", show: Boolean(l?.adverseTable || l?.adverseReactions) },
    { id: "pi-interactions", title: "Drug interactions", show: Boolean(l?.interactions) },
    { id: "pi-overdose", title: "Overdose", show: Boolean(l?.overdosage) },
    { id: "pi-pharm", title: "Mechanism and pharmacokinetics", show: Boolean(l?.mechanism || l?.pharmacokinetics) },
    { id: "pi-storage", title: "How supplied and storage", show: Boolean(l?.howSupplied || l?.storage) },
    { id: "pi-tox", title: "Animal toxicology", show: Boolean(l?.toxicology) },
    { id: "pi-evidence", title: "Evidence", show: true },
  ];

  const physician = (
    <div className="space-y-4">
      {!l ? (
        <Card>
          <p>No FDA label was found for {drugName}, so dosage, side effects and toxicology are not available.</p>
        </Card>
      ) : (
        <Card>
          <SectionHeading>At a glance</SectionHeading>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {drugClass && (
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wide text-gold-text">Class</dt>
                <dd>{drugClass}</dd>
              </div>
            )}
            {l.routes.length > 0 && (
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wide text-gold-text">Route</dt>
                <dd>{l.routes.map((r) => r.toLowerCase()).join(", ")}</dd>
              </div>
            )}
            {l.mechanism && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-semibold uppercase tracking-wide text-gold-text">Mechanism</dt>
                <dd>{truncate(firstSentences(l.mechanism, 1), 260)}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gold-text">Boxed warning</dt>
              <dd className={l.boxedWarning ? "font-semibold text-[#8a1c12]" : ""}>{l.boxedWarning ? "Yes, see below" : "None"}</dd>
            </div>
            {l.controlledSubstance && (
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wide text-gold-text">Controlled substance</dt>
                <dd>Schedule {l.controlledSubstance.replace(/^C/, "")}</dd>
              </div>
            )}
            {costs && (costs.genericRange || costs.brandRange) && (
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wide text-gold-text">Generic</dt>
                <dd>{costs.genericRange ? `Available, from ${money(costs.genericRange.min)} per unit (NADAC)` : "Not available in pharmacies"}</dd>
              </div>
            )}
            {l.pregnancy && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-semibold uppercase tracking-wide text-gold-text">Pregnancy</dt>
                <dd>{truncate(firstSentences(l.pregnancy, 1), 260)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-sm text-muted">
            Label version {l.effectiveDate ?? "date not listed"} · {dailyMed}
          </p>
          <nav aria-label="Label sections" className="mt-3 flex flex-wrap gap-2">
            {sections
              .filter((s) => s.show)
              .map((s) => (
                <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line px-3 py-1 text-sm text-navy hover:border-gold">
                  {s.title}
                </a>
              ))}
          </nav>
        </Card>
      )}

      {l?.boxedWarning && (
        <LabelSection id="pi-boxed" title="Boxed warning" open tone="danger">
          <div className="flex gap-2">
            <ShieldAlert aria-hidden className="mt-1 size-5 shrink-0 text-[#8a1c12]" />
            {/* The label repeats the warning as a short summary after the full text; show the summary first. */}
            <div className="min-w-0">
              <LongText text={l.boxedWarning.split(/See full prescribing information for complete boxed warning\.?/i)[1]?.trim() || l.boxedWarning} preview={500} />
              {/See full prescribing information for complete boxed warning/i.test(l.boxedWarning) && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium text-navy underline">Full boxed warning</summary>
                  <p className="mt-2 whitespace-pre-line">{tidyLabel(l.boxedWarning.split(/WARNING:[^.]*See full prescribing information/i)[0])}</p>
                </details>
              )}
            </div>
          </div>
        </LabelSection>
      )}
      {l?.indications && (
        <LabelSection id="pi-uses" title="Uses (FDA-approved indications)" open>
          <LongText text={l.indications} preview={700} />
          {condition && (
            <p>
              For {condition}: <LabelStatusBadge status={e.labelStatus} />
            </p>
          )}
        </LabelSection>
      )}
      {l?.dosage && (
        <LabelSection id="pi-dosing" title="Dosing and administration" open>
          <LongText text={l.dosage} />
        </LabelSection>
      )}
      {(l?.specificPopulations || l?.pregnancy || l?.lactation || l?.pediatricUse || l?.geriatricUse) && (
        <LabelSection id="pi-populations" title="Specific populations (pregnancy, lactation, children, older adults, kidney and liver)">
          {l.pregnancy && (
            <div>
              <h5 className="font-semibold">Pregnancy</h5>
              <LongText text={l.pregnancy} preview={400} />
            </div>
          )}
          {l.lactation && (
            <div>
              <h5 className="font-semibold">Lactation</h5>
              <LongText text={l.lactation} preview={300} />
            </div>
          )}
          {l.pediatricUse && (
            <div>
              <h5 className="font-semibold">Children</h5>
              <LongText text={l.pediatricUse} preview={300} />
            </div>
          )}
          {l.geriatricUse && (
            <div>
              <h5 className="font-semibold">Older adults</h5>
              <LongText text={l.geriatricUse} preview={300} />
            </div>
          )}
          {l.specificPopulations && !(l.pregnancy || l.lactation) && <LongText text={l.specificPopulations} preview={500} />}
        </LabelSection>
      )}
      {l?.contraindications && (
        <LabelSection id="pi-contra" title="Contraindications" open>
          <LongText text={l.contraindications} preview={400} />
        </LabelSection>
      )}
      {l?.warnings && (
        <LabelSection id="pi-warnings" title="Warnings and precautions">
          <LongText text={l.warnings} />
        </LabelSection>
      )}
      {(l?.adverseTable || l?.adverseReactions) && (
        <LabelSection id="pi-adverse" title="Side effects and how often they occur">
          {l.adverseTable && <LabelTableView table={l.adverseTable} />}
          {l.adverseReactions && <LongText text={l.adverseReactions} preview={l.adverseTable ? 300 : 700} />}
        </LabelSection>
      )}
      {l?.interactions && (
        <LabelSection id="pi-interactions" title="Drug interactions">
          <LongText text={l.interactions} />
        </LabelSection>
      )}
      {l?.overdosage && (
        <LabelSection id="pi-overdose" title="Overdose">
          <LongText text={l.overdosage} preview={500} />
        </LabelSection>
      )}
      {(l?.mechanism || l?.pharmacokinetics) && (
        <LabelSection id="pi-pharm" title="Mechanism of action and pharmacokinetics">
          {l.mechanism && <LongText text={l.mechanism} preview={500} />}
          {l.pharmacokinetics && (
            <div>
              <h5 className="font-semibold">Pharmacokinetics</h5>
              <LongText text={l.pharmacokinetics} preview={500} />
            </div>
          )}
        </LabelSection>
      )}
      {(l?.howSupplied || l?.storage) && (
        <LabelSection id="pi-storage" title="How supplied and storage">
          <LongText text={[l.howSupplied, l.storage].filter(Boolean).join("\n\n")} preview={500} />
        </LabelSection>
      )}
      {l?.toxicology && (
        <LabelSection id="pi-tox" title="Animal safety and toxicity data">
          <LongText text={l.toxicology} preview={500} />
        </LabelSection>
      )}
      <LabelSection id="pi-evidence" title="Clinical trials and meta-analyses" open>
        <p>
          Among the most relevant MEDLINE studies{condition ? ` for ${condition}` : ""}:{" "}
          {plural(count("meta-analysis", "systematic-review"), "meta-analysis or systematic review", "meta-analyses or systematic reviews")},{" "}
          {plural(count("rct"), "randomized trial")} and {plural(count("clinical-trial", "observational"), "other study", "other studies")}.{" "}
          {plural(e.totalTrials, "registered trial")} on ClinicalTrials.gov.
        </p>
        <p className="flex flex-wrap items-center gap-2">
          Certainty: <GradePill level={e.grade.level} label={e.grade.label} /> <span className="text-muted">Details and sources are on the Evidence tab.</span>
        </p>
      </LabelSection>
      {l && <p className="text-sm text-muted">All label sections above are quoted from the {dailyMed}.</p>}
    </div>
  );

  let n = 0;
  const step = () => ++n;
  const generic = costs?.genericRange;
  const brand = costs?.brandRange;
  const medicare = costs?.partD[0];

  const patient = (
    <article className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-3xl font-semibold">
            {drugName}
            {condition ? ` for ${condition}` : ""}
          </h3>
          {plain.mode === "ai" && <AiBadge>Written in plain language by AI, checked against the FDA sources</AiBadge>}
          {plain.mode === "guide" && <span className="text-sm text-muted">From the FDA Medication Guide for patients</span>}
        </div>
        {condition && (
          <p className="mt-2">
            <LabelStatusBadge status={e.labelStatus} />
          </p>
        )}
        <p className="mt-3 text-[1.1rem] leading-relaxed">{plain.whatItIsFor}</p>
        {plain.mostImportant && (
          <p className="mt-3 flex gap-2 rounded-lg border border-[#efb1aa] bg-[#fdf3f2] p-3 text-[1.05rem]">
            <ShieldAlert aria-hidden className="mt-1 size-5 shrink-0 text-[#8a1c12]" />
            <span>
              <strong>Most important: </strong>
              {plain.mostImportant}
            </span>
          </p>
        )}
        {plain.topFive.length > 0 && (
          <div className="mt-4 rounded-lg border-2 border-gold bg-cream/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-xl font-semibold">
              <Star aria-hidden className="size-5 text-gold-text" /> Top things to know
            </h4>
            <ol className="list-decimal space-y-2 pl-6 text-[1.05rem] leading-relaxed">
              {plain.topFive.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>
        )}
        <p className="mt-3 text-sm text-muted">Use this guide to talk with your doctor or pharmacist. Follow their instructions about your dose.</p>
      </Card>

      {plain.howItWorks && (
        <Step n={step()} icon={Sparkles} title="How it works">
          <p>{plain.howItWorks}</p>
        </Step>
      )}

      {plain.beforeYouStart.length > 0 && (
        <Step n={step()} icon={ClipboardList} title="Before you start: tell your doctor if you">
          <List items={plain.beforeYouStart} icon={ListChecks} tone="text-navy" />
        </Step>
      )}

      <Step n={step()} icon={Pill} title="How to take it">
        <List items={plain.howToTake} icon={ListChecks} tone="text-navy" />
        {plain.usualDose && (
          <p className="mt-2">
            <strong>Usual dose: </strong>
            {plain.usualDose}
          </p>
        )}
        {plain.missedDose && (
          <p className="mt-2 rounded-md bg-cream/70 p-3">
            <strong>If you miss a dose: </strong>
            {plain.missedDose}
          </p>
        )}
        {plain.stopping && (
          <p className="mt-2 rounded-md bg-cream/70 p-3">
            <strong>Stopping: </strong>
            {plain.stopping}
          </p>
        )}
      </Step>

      {(plain.whatToExpect || plain.benefits.length > 0) && (
        <Step n={step()} icon={Clock} title="What to expect">
          {plain.whatToExpect && <p>{plain.whatToExpect}</p>}
          <List items={plain.benefits} icon={ThumbsUp} tone="text-[#1d5b36]" />
        </Step>
      )}

      {plain.seriousWarnings.length > 0 && (
        <Step n={step()} icon={ShieldAlert} title="Serious warnings" tone="text-[#8a1c12]">
          <p className="text-muted">These are uncommon, but you should know the signs.</p>
          <List items={plain.seriousWarnings} icon={AlertTriangle} tone="text-[#8a1c12]" />
        </Step>
      )}

      {plain.sideEffectRates.length > 0 && (
        <Step n={step()} icon={BarChart3} title="How common are side effects?">
          <p className="mb-2 text-muted">
            Out of every 100 people taking {drugName} in the studies the FDA reviewed{plain.sideEffectRates.some((r) => r.placebo !== undefined) ? ", compared with people taking a dummy pill (placebo)" : ""}:
          </p>
          <ul className="space-y-2">
            {plain.sideEffectRates.map((r) => (
              <li key={r.effect}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{r.effect}</span>
                  <span className="tabular-nums text-muted">
                    about {Math.round(r.percent)} in 100{r.placebo !== undefined ? ` (placebo: ${Math.round(r.placebo)} in 100)` : ""}
                  </span>
                </div>
                <div aria-hidden className="mt-1 h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-gold" style={{ width: `${Math.max(2, Math.min(100, r.percent))}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">From the clinical trial table on the FDA label. Your own chances may differ.</p>
        </Step>
      )}

      {plain.commonSideEffects.length > 0 && (
        <Step n={step()} icon={HeartPulse} title="Common side effects">
          <p className="text-muted">These are common and often get better as your body gets used to the medicine. Tell your doctor if they bother you or do not go away.</p>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {plain.commonSideEffects.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-gold" />
                {s}
              </li>
            ))}
          </ul>
        </Step>
      )}

      <Step n={step()} icon={AlertTriangle} title="When to get help" tone="text-[#8a1c12]">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border-2 border-[#8a1c12] p-3">
            <p className="mb-2 flex items-center gap-2 font-semibold text-[#8a1c12]">
              <Siren aria-hidden className="size-5" /> Call 911 or go to the emergency room
            </p>
            <List items={plain.call911} icon={AlertTriangle} tone="text-[#8a1c12]" />
          </div>
          <div className="rounded-lg border border-[#c58a00] p-3">
            <p className="mb-2 flex items-center gap-2 font-semibold text-[#6b4e00]">
              <Phone aria-hidden className="size-5" /> Call your doctor soon
            </p>
            {plain.callDoctor.length ? (
              <List items={plain.callDoctor} icon={Info} tone="text-[#6b4e00]" />
            ) : (
              <p>Any side effect that worries you, is severe, or does not go away.</p>
            )}
          </div>
        </div>
        <p className="mt-3 rounded-md bg-cream/70 p-3">
          <strong>Took too much? </strong>
          {plain.overdose}
        </p>
      </Step>

      {plain.monitoring.length > 0 && (
        <Step n={step()} icon={Stethoscope} title="Tests and check-ups">
          <List items={plain.monitoring} icon={ListChecks} tone="text-navy" />
        </Step>
      )}

      {plain.whoShouldNot.length > 0 && (
        <Step n={step()} icon={Ban} title="Who should not take it">
          <List items={plain.whoShouldNot} icon={Ban} tone="text-[#8a1c12]" />
        </Step>
      )}

      {plain.interactions.length > 0 && (
        <Step n={step()} icon={Pill} title="Medicines that can interact">
          <p className="text-muted">Tell your doctor and pharmacist if you take any of these. Do not stop or start other medicines without asking.</p>
          <List items={plain.interactions} icon={Info} tone="text-navy" />
        </Step>
      )}

      <Step n={step()} icon={Info} title="Foods, drinks and other things to avoid">
        <List items={plain.avoid} icon={Info} tone="text-navy" />
      </Step>

      {plain.dailyLife.length > 0 && (
        <Step n={step()} icon={Car} title="Driving and daily life">
          <List items={plain.dailyLife} icon={Info} tone="text-navy" />
        </Step>
      )}

      {plain.pregnancy && (
        <Step n={step()} icon={Baby} title="Pregnancy and breastfeeding">
          <p>{plain.pregnancy}</p>
        </Step>
      )}

      {plain.agesNote && (
        <Step n={step()} icon={Users} title="Children and older adults">
          <p>{plain.agesNote}</p>
        </Step>
      )}

      <Step n={step()} icon={Package} title="Storing and throwing it away">
        <List items={plain.storage} icon={Package} tone="text-navy" />
      </Step>

      {(generic || brand || medicare || plain.drawbacks.length > 0) && (
        <Step n={step()} icon={DollarSign} title="Cost and ways to save">
          {generic && (
            <p>
              A generic version is available. Pharmacies pay about {money(generic.min)} per {generic.unit === "EA" ? "pill or unit" : generic.unit.toLowerCase()} for it; your price
              depends on your insurance and pharmacy.
            </p>
          )}
          {!generic && brand && <p>Only the brand-name version is sold. Ask about patient assistance programs and copay cards.</p>}
          <List items={plain.drawbacks} icon={DollarSign} tone="text-[#6b4e00]" />
          <p>
            Compare cash prices on <SourceLink href={`https://www.goodrx.com/${encodeURIComponent(e.drug.replace(/\s+/g, "-"))}`}>GoodRx</SourceLink> or{" "}
            <SourceLink href="https://costplusdrugs.com/medications/">Cost Plus Drugs</SourceLink>, and find help paying at{" "}
            <SourceLink href="https://medicineassistancetool.org/">Medicine Assistance Tool</SourceLink>.
          </p>
        </Step>
      )}

      <Step n={step()} icon={HelpCircle} title="Questions to ask your doctor">
        <ul className="list-disc space-y-1 pl-5">
          {plain.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Step>

      {(medline.length > 0 || medlineEs.length > 0) && (
        <Step n={step()} icon={ExternalLink} title="Learn more">
          {medline.slice(0, 2).map((m) => (
            <p key={m.url}>
              <SourceLink href={m.url}>{m.title}</SourceLink> <span className="text-muted">(MedlinePlus, English)</span>
            </p>
          ))}
          {medlineEs.slice(0, 1).map((m) => (
            <p key={m.url} lang="es">
              <SourceLink href={m.url}>{m.title}</SourceLink> <span className="text-muted">(MedlinePlus, en español)</span>
            </p>
          ))}
          <p className="text-sm text-muted">MedlinePlus is the U.S. National Library of Medicine&apos;s health website for patients.</p>
        </Step>
      )}

      <p className="text-sm text-muted">
        This handout is general information, not medical advice. Sources: {l ? "the FDA label and Medication Guide" : "public drug information"}
        {medline.length ? ", MedlinePlus" : ""}. Follow your doctor&apos;s instructions about your dose.
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
