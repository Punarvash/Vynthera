"use client";

import { useId, useState, useTransition } from "react";
import { lookupMarketplace, type MarketplaceResult } from "@/app/actions";

const COVERAGE: Record<string, string> = {
  Covered: "Covered",
  GenericCovered: "Generic covered",
  NotCovered: "Not covered",
  DataNotProvided: "Not reported",
};

/** Look up ACA Marketplace (HealthCare.gov) plans by ZIP code; the ZIP goes to HealthCare.gov and is not stored. */
export function MarketplaceLookup({ drug }: { drug: string }) {
  const id = useId();
  const [zip, setZip] = useState("");
  const [result, setResult] = useState<MarketplaceResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await lookupMarketplace(drug, zip)));
        }}
      >
        <label htmlFor={`${id}-zip`} className="block">
          <span className="mb-1 block font-medium">ZIP code</span>
          <input
            id={`${id}-zip`}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
            className="w-32 rounded-md border border-line bg-surface px-3 py-2 tabular-nums"
          />
        </label>
        <button type="submit" disabled={pending || zip.length !== 5} className="rounded-md bg-navy px-4 py-2 font-semibold text-white disabled:opacity-60">
          {pending ? "Checking plans…" : "Check plans"}
        </button>
      </form>
      <div aria-live="polite">
        {result?.error && <p className="mt-3 text-[#8a1c12]">{result.error}</p>}
        {result && !result.error && result.plans.length === 0 && <p className="mt-3">No Marketplace plans were found for that ZIP code.</p>}
        {result && result.plans.length > 0 && (
          <>
            <p className="mt-3 text-muted">
              {result.plans.filter((p) => p.coverage === "Covered" || p.coverage === "GenericCovered").length} of {result.plans.length} lowest-premium
              plans in {result.county}, {result.state} cover this drug. Premiums are for a 40-year-old before tax credits.
            </p>
            <ul className="mt-2 space-y-2">
              {result.plans.map((p) => (
                <li key={p.id} className="rounded-lg border border-line bg-surface p-3">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-muted">
                    {[p.issuer, p.metal, p.type, p.premium !== undefined ? `$${p.premium.toFixed(0)}/month premium` : ""].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1">
                    <span className={p.coverage === "NotCovered" ? "font-semibold text-[#8a1c12]" : "font-semibold"}>{COVERAGE[p.coverage]}</span>
                    {p.drugCosts.length > 0 && <span className="text-sm text-muted"> · {p.drugCosts.map((c) => `${c.tier}: ${c.text}`).join("; ")}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
