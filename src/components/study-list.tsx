"use client";

import { useMemo, useState, useTransition } from "react";
import { loadMoreStudies } from "@/app/actions";
import { compareDesign } from "@/lib/design";
import type { Article } from "@/lib/types";
import { ArticleCard } from "./article-card";
import { Button } from "./ui";

const DESIGN_GROUPS = {
  all: { label: "All designs", match: () => true },
  reviews: { label: "Meta-analyses and reviews", match: (a: Article) => a.design === "meta-analysis" || a.design === "systematic-review" },
  rcts: { label: "Randomized trials", match: (a: Article) => a.design === "rct" },
  other: { label: "Other trials and observational", match: (a: Article) => a.design === "clinical-trial" || a.design === "observational" },
} as const;

const FUNDING = {
  all: "Any funding",
  independent: "Independent",
  industry: "Industry-funded",
  unreported: "Funding not reported",
} as const;

const SORTS = {
  best: "Strongest evidence first",
  newest: "Newest first",
  cited: "Most cited first",
} as const;

const SINCE = ["any", "2020", "2015", "2010"] as const;

function bestOrder(a: Article, b: Article): number {
  return (
    Number(b.aboutDrug) - Number(a.aboutDrug) ||
    compareDesign(a.design, b.design) ||
    Number(b.cochrane) - Number(a.cochrane) ||
    (b.citations ?? 0) - (a.citations ?? 0)
  );
}

/** Published studies with filters, sorting and "Load more", all in the browser except fetching the next page. */
export function StudyList({
  initial,
  total,
  drug,
  condition,
  pageSize,
}: {
  initial: Article[];
  total: number;
  drug: string;
  condition?: string;
  pageSize: number;
}) {
  const [studies, setStudies] = useState(initial);
  const [design, setDesign] = useState<keyof typeof DESIGN_GROUPS>("all");
  const [funding, setFunding] = useState<keyof typeof FUNDING>("all");
  const [since, setSince] = useState<(typeof SINCE)[number]>("any");
  const [mainOnly, setMainOnly] = useState(false);
  const [sort, setSort] = useState<keyof typeof SORTS>("best");
  const [shown, setShown] = useState(8);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fetchedPages = Math.ceil(studies.length / pageSize);
  const canLoadMore = studies.length < total && fetchedPages * pageSize < total;

  const visible = useMemo(() => {
    const list = studies.filter(
      (a) =>
        DESIGN_GROUPS[design].match(a) &&
        (funding === "all" || a.funding.kind === funding) &&
        (since === "any" || Number(a.year) >= Number(since)) &&
        (!mainOnly || a.aboutDrug),
    );
    const sorted = [...list];
    if (sort === "best") sorted.sort(bestOrder);
    if (sort === "newest") sorted.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    if (sort === "cited") sorted.sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1));
    return sorted;
  }, [studies, design, funding, since, mainOnly, sort]);

  function loadMore() {
    setError("");
    startTransition(async () => {
      try {
        const next = await loadMoreStudies(drug, condition, fetchedPages * pageSize);
        const seen = new Set(studies.map((a) => a.id));
        setStudies((prev) => [...prev, ...next.filter((a) => !seen.has(a.id))]);
        setShown((n) => n + next.length);
      } catch {
        setError("PubMed is not responding right now. Try again in a minute.");
      }
    });
  }

  const select = "rounded-md border border-[#b7c2d1] bg-surface shadow-[inset_0_1px_2px_rgba(31,36,44,0.04)] transition focus:ring-4 focus:ring-sky/30 focus-visible:outline-none px-2 py-1.5 text-[0.95rem]";
  return (
    <div>
      <div role="group" aria-label="Filter and sort studies" className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="f-design">Study design</label>
        <select id="f-design" className={select} value={design} onChange={(e) => setDesign(e.target.value as typeof design)}>
          {Object.entries(DESIGN_GROUPS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-funding">Funding</label>
        <select id="f-funding" className={select} value={funding} onChange={(e) => setFunding(e.target.value as typeof funding)}>
          {Object.entries(FUNDING).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-since">Published since</label>
        <select id="f-since" className={select} value={since} onChange={(e) => setSince(e.target.value as typeof since)}>
          {SINCE.map((y) => (
            <option key={y} value={y}>{y === "any" ? "Any year" : `Since ${y}`}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-sort">Sort</label>
        <select id="f-sort" className={select} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[0.95rem]">
          <input type="checkbox" className="size-4" checked={mainOnly} onChange={(e) => setMainOnly(e.target.checked)} />
          Only studies about the drug
        </label>
      </div>
      <p className="mb-2 text-sm text-muted" aria-live="polite">
        Showing {Math.min(shown, visible.length)} of {visible.length} matching studies ({studies.length.toLocaleString("en-US")} loaded of{" "}
        {total.toLocaleString("en-US")} in PubMed).
      </p>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-4">No studies match these filters.</p>
      ) : (
        <ul className="space-y-3">
          {visible.slice(0, shown).map((a) => (
            <li key={a.id}>
              <ArticleCard article={a} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {shown < visible.length && (
          <Button variant="secondary" onClick={() => setShown((n) => n + 10)}>
            Show {Math.min(10, visible.length - shown)} more
          </Button>
        )}
        {canLoadMore && shown >= visible.length && (
          <Button variant="secondary" onClick={loadMore} disabled={pending}>
            {pending ? "Loading…" : `Load ${pageSize} more from PubMed`}
          </Button>
        )}
        {error && <p role="alert" className="text-[#8a1c12]">{error}</p>}
      </div>
    </div>
  );
}
