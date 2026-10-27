import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SourceProblems } from "@/components/source-problems";
import { Card, LoadingBlock } from "@/components/ui";
import { cleanCondition } from "@/lib/evidence";
import { drugHref } from "@/lib/links";
import { runSearch, type DrugMatch } from "@/lib/search";
import { baseDrugName } from "@/lib/sources/openfda";
import { didYouMean } from "@/lib/suggest";
import { titleCase } from "@/lib/text";

export const metadata: Metadata = { title: "Search" };

function DrugList({ drugs, condition }: { drugs: { name: string; note?: string }[]; condition?: string }) {
  // Every route links by ingredient name, so a drug opens the same page from a condition or a name search.
  const unique = [...new Map(drugs.map((d) => [baseDrugName(d.name), { ...d, name: baseDrugName(d.name) }])).values()];
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {unique.map((d) => (
        <li key={d.name}>
          <Link
            href={drugHref(d.name, condition)}
            className="block rounded-lg border border-line bg-surface px-4 py-3 hover:border-gold focus-visible:border-gold"
          >
            <span className="font-semibold text-navy">{titleCase(d.name)}</span>
            {d.note && <span className="block text-sm text-muted">{d.note}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DrugCards({ drugs, condition }: { drugs: DrugMatch[]; condition?: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {drugs.map((d) => (
        <li key={d.name}>
          <Link
            href={drugHref(d.name, condition)}
            className={`flex h-full items-start justify-between gap-3 rounded-lg border bg-surface px-4 py-3 hover:border-gold focus-visible:border-gold ${d.exact ? "border-gold" : "border-line"}`}
          >
            <span>
              <span className="text-lg font-semibold text-navy">{titleCase(d.name)}</span>
              {d.exact && <span className="ml-2 rounded bg-cream px-1.5 py-0.5 text-xs font-semibold text-gold-text">Best match</span>}
              <span className="block text-sm text-muted">
                {[d.brandNames.length ? `Brands: ${d.brandNames.slice(0, 3).join(", ")}` : "", d.drugClass, d.routes.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}
              </span>
            </span>
            <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function phaseNote(maxPhase?: number): string | undefined {
  if (maxPhase === undefined) return undefined;
  return maxPhase >= 4 ? "Approved, or in phase 4 trials, for this or a closely related condition (any country)" : `Studied up to phase ${maxPhase}`;
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const q = cleanCondition(sp.q);
  const condition = cleanCondition(sp.condition);
  if (!q) {
    return <p>Type a drug, condition or mechanism to search.</p>;
  }

  const [r, suggestion] = await Promise.all([runSearch(q), didYouMean(q).catch(() => null)]);

  // When the query is a condition, carry it to the drug page so off-label status can be checked.
  const asCondition = condition ?? (!r.exactDrug && (r.byIndication.length || r.disease) ? q : undefined);
  // A drug name also turns up in other labels' indications ("used with metformin"); that is not a condition search.
  const isDrug = Boolean(r.exactDrug);
  const sections = [
    r.drugs.length > 0 && (
      <section key="drugs">
        <h2 className="mb-1 text-xl font-semibold">{isDrug ? "Drug" : "Drugs with a matching name"}</h2>
        <p className="mb-3 text-muted">Open a drug for its evidence, costs, specialists and patient information.</p>
        <DrugCards drugs={r.drugs} condition={condition} />
      </section>
    ),
    // A mechanism query ("GLP-1 receptor agonist") also appears in label indications text; that is not an approved use.
    !isDrug && r.byIndication.length > 0 && (r.disease || r.byMechanism.length === 0) && (
      <section key="ind">
        <h2 className="mb-1 text-xl font-semibold">FDA-approved for &ldquo;{q}&rdquo;</h2>
        <p className="mb-3 text-muted">Drugs whose FDA label indications mention this condition.</p>
        <DrugList drugs={r.byIndication.map((name) => ({ name }))} condition={asCondition} />
      </section>
    ),
    !isDrug && r.disease && (
      <section key="disease">
        <h2 className="mb-1 text-xl font-semibold">Drugs studied for {r.disease.name}</h2>
        <p className="mb-3 text-muted">From Open Targets, including investigational and possible off-label uses.</p>
        <DrugList
          drugs={r.disease.drugs.map((d) => ({ name: d.name, note: [d.mechanism, phaseNote(d.maxPhase)].filter(Boolean).join(" · ") }))}
          condition={asCondition}
        />
      </section>
    ),
    r.byMechanism.length > 0 && (
      <section key="moa">
        <h2 className="mb-1 text-xl font-semibold">Drugs with the mechanism &ldquo;{q}&rdquo;</h2>
        <p className="mb-3 text-muted">From FDA pharmacologic classes.</p>
        <DrugList drugs={r.byMechanism.map((d) => ({ name: d.name, note: d.classes.join(", ") }))} condition={condition} />
      </section>
    ),
    r.target && (
      <section key="target">
        <h2 className="mb-1 text-xl font-semibold">Drugs acting on {r.target.name}</h2>
        <p className="mb-3 text-muted">From Open Targets.</p>
        <DrugList
          drugs={r.target.drugs.map((d) => ({ name: d.name, note: [d.mechanism, phaseNote(d.maxPhase)].filter(Boolean).join(" · ") }))}
          condition={condition}
        />
      </section>
    ),
  ].filter(Boolean);

  const asDrugLink = (
    <p className="mt-10 text-muted">
      Looking for a drug named &ldquo;{q}&rdquo;?{" "}
      <Link href={drugHref(q, condition)} className="font-semibold text-navy underline">
        Search the literature for {q} as a drug
      </Link>
    </p>
  );

  // Offer the likely intended term when the query is not itself a known drug or condition.
  const offer = suggestion && !r.exactDrug && !(r.disease && r.disease.name.toLowerCase() === q.toLowerCase()) ? suggestion : null;
  return (
    <>
      <SourceProblems problems={r.problems} />
      {offer && (
        <p className="mb-6 rounded-lg border-l-4 border-gold bg-surface px-4 py-3 text-lg">
          Did you mean{" "}
          <Link href={`/search?${new URLSearchParams({ q: offer.label, ...(condition ? { condition } : {}) })}`} className="font-semibold text-navy underline">
            {offer.label}
          </Link>
          {offer.kind !== "drug" ? ` (${offer.kind === "class" ? "drug class" : "condition"})` : ""}?
        </p>
      )}
      {sections.length === 0 ? (
        <Card>
          <h2 className="text-xl font-semibold">No matches for &ldquo;{q}&rdquo;</h2>
          <p className="mt-2 text-muted">
            Check the spelling, or try the generic drug name (for example &ldquo;semaglutide&rdquo; rather than a brand), the full
            condition name, or a drug class such as &ldquo;SGLT2 inhibitor&rdquo;.
          </p>
        </Card>
      ) : (
        <div className="space-y-10">{sections}</div>
      )}
      {!isDrug && asDrugLink}
    </>
  );
}

async function HeaderSearch({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  return <SearchForm size="compact" defaultQuery={cleanCondition(sp.q) ?? ""} defaultCondition={cleanCondition(sp.condition) ?? ""} />;
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <SiteHeader>
        <Suspense fallback={<SearchForm size="compact" />}>
          <HeaderSearch searchParams={searchParams} />
        </Suspense>
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="sr-only">Search results</h1>
        <Suspense fallback={<LoadingBlock label="Searching FDA labels and Open Targets…" lines={6} />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
