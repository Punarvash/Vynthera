"use client";

import { useId, useState } from "react";
import type { PriceTrend } from "@/lib/cost-details";

function money(n: number): string {
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]} ${y}`;
}

const W = 640;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 56 };

/** NADAC price per unit by month for one product at a time, with a table view. */
export function PriceTrendChart({ trends }: { trends: (PriceTrend & { label: string })[] }) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const t = trends[index];
  if (!t) return null;
  const points = t.values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.v)) * 1.1;
  const x = (i: number) => PAD.left + (i / (t.months.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const ticks = [0, max / 2, max];
  const change = t.change;
  const shown = hover !== null ? points.find((p) => p.i === hover) : undefined;

  return (
    <figure>
      {trends.length > 1 && (
        <label className="mb-2 block" htmlFor={`${id}-product`}>
          <span className="mb-1 block text-sm font-medium">Product</span>
          <select
            id={`${id}-product`}
            value={index}
            onChange={(e) => {
              setIndex(Number(e.target.value));
              setHover(null);
            }}
            className="w-full rounded-md border border-line bg-surface px-3 py-2"
          >
            {trends.map((tr, i) => (
              <option key={tr.description} value={i}>
                {tr.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <figcaption className="mb-1 font-semibold">
        {t.label}: pharmacy cost per unit
        {change !== undefined && (
          <span className="ml-2 font-normal text-muted">
            {change > 0 ? "up" : change < 0 ? "down" : "unchanged"} {Math.abs(change * 100).toFixed(0)}% over {points.length} months
          </span>
        )}
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`NADAC price per unit from ${monthLabel(t.months[points[0].i])} to ${monthLabel(t.months[points[points.length - 1].i])}`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {money(v)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--muted)">
            {monthLabel(t.months[0])}
          </text>
          <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--muted)">
            {monthLabel(t.months[t.months.length - 1])}
          </text>
          <path d={path} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {shown && (
            <>
              <line x1={x(shown.i)} x2={x(shown.i)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(shown.i)} cy={y(shown.v)} r={5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
          {/* Hit areas wider than the line, one per month. */}
          {points.map((p) => (
            <rect
              key={p.i}
              x={x(p.i) - (W - PAD.left - PAD.right) / t.months.length / 2}
              y={PAD.top}
              width={(W - PAD.left - PAD.right) / t.months.length}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(p.i)}
            />
          ))}
        </svg>
        {shown && (
          <p className="pointer-events-none absolute top-0 right-0 rounded-md border border-line bg-surface px-2 py-1 text-sm shadow" aria-live="polite">
            {monthLabel(t.months[shown.i])}: <span className="font-semibold tabular-nums">{money(shown.v)}</span>
          </p>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="font-medium text-navy">Show as table</summary>
        <table className="mt-2 w-full max-w-sm border-collapse text-left">
          <caption className="sr-only">NADAC price per unit by month</caption>
          <tbody>
            {points.map((p) => (
              <tr key={p.i} className="border-t border-line">
                <th scope="row" className="py-1 pr-4 font-normal">{monthLabel(t.months[p.i])}</th>
                <td className="py-1 text-right tabular-nums">{money(p.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
