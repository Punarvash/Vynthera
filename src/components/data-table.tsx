import type { ReactNode } from "react";

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "right";
  /** Shown as the card title on phones instead of a labelled line. */
  primary?: boolean;
}

/** A table on wider screens; each row becomes a small card on phones so nothing scrolls sideways. */
export function DataTable<T>({ rows, columns, rowKey, caption, highlight }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  highlight?: (row: T) => boolean;
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
        <table className="w-full border-collapse text-left text-[0.95rem]">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-cream">
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col" className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className={`border-t border-line ${highlight?.(r) ? "bg-[#e8eff8] font-semibold" : ""}`}>
                {columns.map((c, i) => (
                  <td key={i} className={`px-3 py-1.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 sm:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className={`rounded-lg border border-line p-3 ${highlight?.(r) ? "bg-[#e8eff8]" : "bg-surface"}`}>
            <p className="font-semibold">{primary.cell(r)}</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              {rest.map((c, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted">{c.header}</dt>
                  <dd className="text-right tabular-nums">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
