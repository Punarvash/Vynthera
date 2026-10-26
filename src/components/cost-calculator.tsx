"use client";

import { useId, useState } from "react";
import { InfoTip } from "./info-tip";
import { estimatePartD, PART_D_2026 } from "@/lib/medicare-benefit";

export interface CalculatorProduct {
  label: string;
  perUnit: number;
  unit: string;
  brand: boolean;
}

function whole(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`;
}

function money(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SUPPLIES = [30, 60, 90] as const;

/**
 * Pick a product and quantity to see what one fill costs the pharmacy, what Medicare pays in total,
 * and what a Medicare patient would pay under the standard benefit. Runs in the browser; nothing is sent.
 */
export function CostCalculator({
  products,
  medicarePerUnit,
  insulin,
  planCost,
}: {
  products: CalculatorProduct[];
  /** Medicare Part D gross cost per unit for generic and brand versions, when known. */
  medicarePerUnit: { generic?: number; brand?: number };
  insulin: boolean;
  /** What most Medicare plans charge for a one-month fill, from their filed formularies. */
  planCost?: { copay?: number; coinsurance?: number; plans: number; covered: number };
}) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [perDay, setPerDay] = useState(1);
  const [days, setDays] = useState<(typeof SUPPLIES)[number]>(30);
  const p = products[index];
  if (!p) return null;

  const countable = p.unit.toUpperCase() === "EA";
  // Pens, syringes, vials and kits are used weekly or less, so they are counted per fill, not per day.
  const perFillMode = countable && !/\b(tab|tablet|tabs|cap|capsule|caps|lozenge|troche|packet|patch)\b/i.test(p.label);
  const quantity = countable ? (perFillMode ? perDay * (days / 30) : perDay * days) : days;
  const fillsPerYear = Math.round(365 / days);
  const pharmacy = p.perUnit * quantity;
  const medicareUnit = p.brand ? medicarePerUnit.brand : medicarePerUnit.generic;
  // Medicare's average per unit already includes the pharmacy's fee; fall back to the NADAC cost.
  const gross = medicareUnit !== undefined && countable ? medicareUnit * quantity : pharmacy;
  const est = estimatePartD(gross, fillsPerYear, { insulin });

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-3" htmlFor={`${id}-product`}>
          <span className="mb-1 block font-medium">Product</span>
          <select
            id={`${id}-product`}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            className="w-full rounded-md border border-line bg-surface px-3 py-2"
          >
            {products.map((x, i) => (
              <option key={x.label} value={i}>
                {x.label} ({x.brand ? "brand" : "generic"})
              </option>
            ))}
          </select>
        </label>
        {countable && (
          <label className="block" htmlFor={`${id}-per-day`}>
            <span className="mb-1 block font-medium">{perFillMode ? "Pens, syringes or packs per month" : "Units per day"}</span>
            <input
              id={`${id}-per-day`}
              type="number"
              min={0.5}
              max={20}
              step={0.5}
              value={perDay}
              onChange={(e) => setPerDay(Math.min(20, Math.max(0.5, Number(e.target.value) || 1)))}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 tabular-nums"
            />
          </label>
        )}
        <fieldset className={countable ? "sm:col-span-2" : "sm:col-span-3"}>
          <legend className="mb-1 font-medium">Days per fill</legend>
          <div className="flex gap-2">
            {SUPPLIES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={`rounded-md border px-4 py-2 ${days === d ? "border-navy bg-navy text-white" : "border-line bg-surface"}`}
              >
                {d} days
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {!countable && <p className="mt-2 text-sm text-muted">Priced {p.unit === "ML" ? "per mL" : "per gram"}: shown for {days} {p.unit === "ML" ? "mL" : "g"}.</p>}

      <dl className="mt-4 grid gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="rounded-md bg-cream/70 p-3">
          <dt className="text-sm font-medium">
            Pharmacy&apos;s cost per fill
            <InfoTip term="nadac" label="NADAC" />
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">{money(pharmacy)}</dd>
          <dd className="text-sm text-muted">{countable ? `${quantity} ${perFillMode ? "pens, syringes or packs" : "units"}` : ""} at {money(p.perUnit)} each (NADAC)</dd>
        </div>
        <div className="rounded-md bg-cream/70 p-3">
          <dt className="text-sm font-medium">
            Medicare total per fill
            <InfoTip term="partD" label="Medicare Part D" />
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">{money(gross)}</dd>
          <dd className="text-sm text-muted">
            {medicareUnit !== undefined && countable ? "Plan and patient together, at Medicare's average unit cost" : "Pharmacy cost used; Medicare unit cost not available"}
          </dd>
        </div>
        <div className="rounded-md bg-cream/70 p-3">
          <dt className="text-sm font-medium">Medicare patient pays (estimate)</dt>
          <dd className="text-2xl font-semibold tabular-nums">{money(est.yearlyPatient)}<span className="text-base font-normal"> / year</span></dd>
          {planCost && (planCost.copay !== undefined || planCost.coinsurance !== undefined) && (
            <dd className="text-sm font-medium">
              Most Medicare plans charge{" "}
              {planCost.copay !== undefined
                ? `${whole(planCost.copay)} a month`
                : `${Math.round((planCost.coinsurance ?? 0) * 100)}% (about ${money(Math.min(gross * (planCost.coinsurance ?? 0), PART_D_2026.outOfPocketCap))}${gross * (planCost.coinsurance ?? 0) * fillsPerYear > PART_D_2026.outOfPocketCap ? ` a fill until the ${whole(PART_D_2026.outOfPocketCap)} yearly cap` : ""})`}
              {days !== 30 ? " for a one-month supply" : ""}.
            </dd>
          )}
          <dd className="text-sm text-muted">
            {insulin
              ? `Insulin is capped at $${PART_D_2026.insulinMonthlyCap} a month.`
              : `Standard benefit: first fill ${money(est.firstFill)}, then about ${money(est.laterFill)} a fill${est.hitsCap ? `; capped at ${whole(PART_D_2026.outOfPocketCap)} a year` : ""}.`}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        Patient estimate uses the {PART_D_2026.year} standard Medicare drug benefit: {whole(PART_D_2026.deductible)} deductible, then{" "}
        {PART_D_2026.coinsurance * 100}% coinsurance, with a {whole(PART_D_2026.outOfPocketCap)} yearly cap, for this drug alone and{" "}
        {fillsPerYear} fills a year. Most plans charge flat copays instead; see the plan table below. With Extra Help
        <InfoTip term="extraHelp" label="Extra Help" />, copays are at most {whole(PART_D_2026.extraHelp.generic)} (generic) or{" "}
        {whole(PART_D_2026.extraHelp.brand)} (brand).
      </p>
    </div>
  );
}
