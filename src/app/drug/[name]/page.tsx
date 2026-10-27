import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { DrugTabs } from "@/components/drug-tabs";
import { SearchForm } from "@/components/search-form";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SourceProblems } from "@/components/source-problems";
import { AiSummary, SummaryCard } from "@/components/summary-card";
import { CasesTab, EvidenceTab } from "@/components/tabs-content";
import { PatientTab } from "@/components/patient-tab";
import { ManufacturerTab } from "@/components/manufacturer-tab";
import { CostsTab } from "@/components/costs-tab";
import { SpecialistsTab } from "@/components/specialists-tab";
import { cleanFilters } from "@/lib/specialists";
import { Card, LoadingBlock, Skeleton, SourceLink } from "@/components/ui";
import { cleanCondition, cleanDrugName } from "@/lib/evidence";
import { loadOverview } from "@/lib/loaders";
import { resolveDrug } from "@/lib/drug-identity";
import { parseTab } from "@/lib/tabs";
import { titleCase } from "@/lib/text";

export const metadata: Metadata = { title: "Drug" };

type Props = PageProps<"/drug/[name]">;

async function DrugHeading({ drug, searched }: { drug: string; searched: string }) {
  const { label, problems } = await loadOverview(drug);
  return (
    <div className="space-y-2">
      <SourceProblems problems={problems} />
      <h1 className="font-serif text-4xl font-semibold">{titleCase(label?.genericName ?? drug)}</h1>
      {searched.toLowerCase() !== drug && (
        <p className="text-[0.95rem] text-muted">
          Showing the ingredient for &ldquo;{searched}&rdquo;, so every name for this drug gives the same results.
        </p>
      )}
      {label ? (
        <p className="text-muted">
          {label.brandNames.length > 0 && <>Brand: {label.brandNames.slice(0, 4).join(", ")} · </>}
          Manufacturer: {label.manufacturer}
          {label.routes.length > 0 && <> · Route: {label.routes.map((r) => r.toLowerCase()).join(", ")}</>} ·{" "}
          <SourceLink href={label.dailyMedUrl}>DailyMed label</SourceLink>
        </p>
      ) : (
        <p className="text-muted">
          No FDA label was found under this name. Literature and trial results are still shown; try the generic name for label
          details.
        </p>
      )}
    </div>
  );
}

function ConditionForm({ drug, condition, tab }: { drug: string; condition?: string; tab?: string }) {
  return (
    <form method="get" action={`/drug/${encodeURIComponent(drug)}`} className="no-print flex flex-wrap items-end gap-2">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <div className="min-w-0 flex-[1_1_16rem]">
        <label htmlFor="condition-filter" className="mb-1 block font-semibold">
          Patient&apos;s condition <span className="font-normal text-muted">(narrows the evidence and checks off-label use)</span>
        </label>
        <AutocompleteInput
          id="condition-filter"
          name="condition"
          kinds={["condition"]}
          defaultValue={condition ?? ""}
          placeholder="e.g. polycystic ovary syndrome"
          className="w-full rounded-lg border border-[#cbbd9f] bg-surface px-3 py-2 focus:border-navy"
        />
      </div>
      <button type="submit" className="rounded-lg border border-navy bg-surface px-4 py-2 font-semibold text-navy hover:bg-cream">
        {condition ? "Update" : "Apply"}
      </button>
      {condition && (
        <p className="w-full rounded-md bg-cream/70 px-3 py-2 text-[0.95rem]">
          Evidence, cases, off-label status and specialists are shown for <strong>{condition}</strong>. Costs, manufacturer and the FDA
          label are the same for every use.{" "}
          <Link href={`/drug/${encodeURIComponent(drug)}${tab ? `?tab=${tab}` : ""}`} className="font-semibold text-navy underline">
            Show all uses instead
          </Link>
        </p>
      )}
    </form>
  );
}

async function DrugContent({ params, searchParams }: Props) {
  const [{ name }, sp] = await Promise.all([params, searchParams]);
  // Brand, salt or generic: every name for the drug opens the same ingredient, so every route gives the same results.
  const identity = await resolveDrug(cleanDrugName(name));
  const drug = identity.name;
  const condition = cleanCondition(sp.condition);
  const tab = parseTab(sp.tab);
  const props = { drug, condition };

  return (
    <div className="space-y-6">
      <Suspense fallback={<Skeleton className="h-16 w-2/3" />}>
        <DrugHeading drug={drug} searched={cleanDrugName(name)} />
      </Suspense>
      <ConditionForm drug={drug} condition={condition} tab={tab} />
      <Suspense fallback={<Card><LoadingBlock label="Loading key takeaways…" lines={4} /></Card>}>
        <SummaryCard {...props} />
      </Suspense>
      <Suspense fallback={<Card><LoadingBlock label="Summarizing the evidence…" lines={3} /></Card>}>
        <AiSummary {...props} />
      </Suspense>
      <div id="drug-tabs" className="scroll-mt-4">
        <DrugTabs
          initial={tab}
          lazy={["specialists"]}
          panels={{
            evidence: (
              <Suspense fallback={<LoadingBlock label="Loading studies from PubMed and ClinicalTrials.gov…" lines={6} />}>
                <EvidenceTab {...props} />
              </Suspense>
            ),
            cases: (
              <Suspense fallback={<LoadingBlock label="Loading published case reports…" lines={6} />}>
                <CasesTab {...props} />
              </Suspense>
            ),
            manufacturer: (
              <Suspense fallback={<LoadingBlock label="Loading FDA applications and manufacturer research…" lines={6} />}>
                <ManufacturerTab drug={drug} />
              </Suspense>
            ),
            costs: (
              <Suspense fallback={<LoadingBlock label="Loading NADAC and Medicare cost data…" lines={6} />}>
                <CostsTab drug={drug} />
              </Suspense>
            ),
            // Specialists queries Medicare's rate-limited data service, so it runs only when its tab is open.
            specialists:
              tab === "specialists" ? (
                <Suspense fallback={<LoadingBlock label="Finding clinicians who prescribe this drug…" lines={6} />}>
                  <SpecialistsTab {...props} filters={cleanFilters(sp)} />
                </Suspense>
              ) : (
                <LoadingBlock label="Finding clinicians who prescribe this drug…" lines={6} />
              ),
            patient: (
              <Suspense fallback={<LoadingBlock label="Loading label and MedlinePlus information…" lines={6} />}>
                <PatientTab {...props} />
              </Suspense>
            ),
          }}
        />
      </div>
    </div>
  );
}

export default function DrugPage(props: Props) {
  return (
    <>
      <SiteHeader>
        <SearchForm size="compact" />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Suspense fallback={<LoadingBlock label="Loading drug information…" lines={8} />}>
          <DrugContent {...props} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
