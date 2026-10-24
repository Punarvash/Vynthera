import type { DesignCounts } from "@/lib/types";
import { InfoTip } from "./info-tip";

const ROWS: { key: keyof DesignCounts; label: string }[] = [
  { key: "metaAnalyses", label: "Meta-analyses and systematic reviews" },
  { key: "rcts", label: "Randomized trials" },
  { key: "nonRandomized", label: "Non-randomized trials" },
  { key: "observational", label: "Observational studies" },
  { key: "caseReports", label: "Case reports" },
];

function TableView({ caption, rows }: { caption: string; rows: [string, number][] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="font-medium text-navy">Show as table</summary>
      <table className="mt-2 w-full max-w-md border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-line">
              <th scope="row" className="py-1 pr-4 font-normal">{k}</th>
              <td className="py-1 text-right tabular-nums">{v.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Strongest designs at the top: how much of each kind of evidence exists. */
export function EvidencePyramid({ counts, full }: { counts: DesignCounts; full: boolean }) {
  const max = Math.max(1, ...ROWS.map((r) => counts[r.key]));
  return (
    <figure>
      <figcaption className="mb-2 font-semibold">
        Evidence by study design
        <InfoTip term="mainTopic" label="studies about the drug" />
      </figcaption>
      <div className="space-y-0.5" role="list">
        {ROWS.map((r) => {
          const n = counts[r.key];
          return (
            <div key={r.key} role="listitem" className="grid grid-cols-[minmax(8rem,13rem)_1fr] items-center gap-3" title={`${r.label}: ${n.toLocaleString("en-US")}`}>
              <span className="text-[0.95rem]">{r.label}</span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="block h-5 rounded-r bg-chart"
                  style={{ width: n ? `max(4px, ${(n / max) * 100}%)` : 0 }}
                />
                <span className="text-sm tabular-nums text-muted">{n.toLocaleString("en-US")}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted">
        {full ? "Full MEDLINE counts" : "Counts from the studies shown (full counts unavailable)"} for studies with the drug as a main topic.
      </p>
      <TableView caption="Studies by design" rows={ROWS.map((r) => [r.label, counts[r.key]])} />
    </figure>
  );
}

/** Publications per year, to show whether research is recent or old. */
export function PublicationTimeline({ byYear, total, sampled }: { byYear: Record<string, number>; total: number; sampled: number }) {
  // Latest year with data, so the chart never depends on the server clock.
  const thisYear = Math.max(...Object.keys(byYear).map(Number).filter(Number.isFinite), 2000);
  const years = Array.from({ length: 25 }, (_, i) => thisYear - 24 + i);
  const values = years.map((y) => byYear[String(y)] ?? 0);
  const max = Math.max(1, ...values);
  const peak = years[values.indexOf(Math.max(...values))];
  if (values.every((v) => v === 0)) return null;
  return (
    <figure>
      <figcaption className="mb-2 font-semibold">Publications per year</figcaption>
      <div className="flex h-28 items-end gap-0.5 border-b border-line" role="img" aria-label={`Publications per year, ${years[0]} to ${thisYear}. Peak in ${peak}.`}>
        {years.map((y, i) => (
          <span
            key={y}
            title={`${y}: ${values[i]} publications`}
            className="block flex-1 rounded-t bg-chart"
            style={{ height: values[i] ? `max(2px, ${(values[i] / max) * 100}%)` : 0 }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{years[0]}</span>
        <span>Peak: {peak} ({Math.max(...values)})</span>
        <span>{thisYear}</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        PubMed records in Europe PMC mentioning the drug{sampled < total ? `; the ${sampled.toLocaleString("en-US")} most relevant of ${total.toLocaleString("en-US")}` : ""}.
      </p>
      <TableView caption="Publications per year" rows={years.map((y, i) => [String(y), values[i]] as [string, number]).filter(([, v]) => v > 0)} />
    </figure>
  );
}
