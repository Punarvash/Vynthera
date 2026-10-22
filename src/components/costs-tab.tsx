import { CalendarClock, Info } from "lucide-react";
import { CopyTextButton } from "./copy-text";
import { SourceProblems } from "./source-problems";
import { Badge, Card, SectionHeading, SourceLink } from "./ui";
import { formatProduct, money, unitLabel, type CostBundle, type NadacPrice } from "@/lib/costs";
import { loadCosts } from "@/lib/loaders";
import { titleCase } from "@/lib/text";

function Updated({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
      <CalendarClock aria-hidden className="size-4" /> {children}
    </p>
  );
}

function PriceTable({ prices }: { prices: NadacPrice[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-[0.95rem]">
        <thead className="bg-cream">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Product</th>
            <th scope="col" className="px-3 py-2 font-semibold">Type</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Cost per unit</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">30 units</th>
            <th scope="col" className="px-3 py-2 font-semibold">Price date</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.description} className="border-t border-line">
              <td className="px-3 py-1.5">{formatProduct(p.description)}</td>
              <td className="px-3 py-1.5">{p.brand ? "Brand" : "Generic"}{p.otc ? ", OTC" : ""}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {money(p.perUnit)} <span className="text-muted">/{p.unit.toLowerCase()}</span>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{p.unit === "EA" ? money(p.perUnit * 30) : "–"}</td>
              <td className="px-3 py-1.5">{p.effectiveDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function costSummaryText(c: CostBundle): string {
  const lines = [`Estimated costs for ${c.drug}`];
  if (c.genericRange) lines.push(`Generic pharmacy acquisition cost (NADAC): ${money(c.genericRange.min)}–${money(c.genericRange.max)} ${unitLabel(c.genericRange.unit)}, as of ${c.nadacAsOf}.`);
  if (c.brandRange) lines.push(`Brand pharmacy acquisition cost (NADAC): ${money(c.brandRange.min)}–${money(c.brandRange.max)} ${unitLabel(c.brandRange.unit)}.`);
  for (const r of c.partD.slice(0, 3)) {
    lines.push(`Medicare Part D ${c.partDYear}, ${r.brand}: average ${money(r.avgPerClaim)} per prescription fill (plan and patient combined).`);
  }
  lines.push("Patient out-of-pocket cost depends on the plan; check with the pharmacy or insurer.");
  return lines.join("\n");
}

export async function CostsTab({ drug }: { drug: string }) {
  const c = await loadCosts(drug);
  const allPrices = [...c.generic, ...c.brand];

  if (!c.imported) {
    return (
      <Card>
        <h2 className="text-2xl font-semibold">Costs</h2>
        <p className="mt-2">
          Cost data has not been imported yet. It is loaded weekly from Medicaid&apos;s NADAC survey and Medicare Part D. To load
          it now, open the repository on GitHub, go to <strong>Actions → Import cost data → Run workflow</strong>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <SourceProblems problems={c.problems} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Estimated treatment costs: {c.drug}</h2>
          <p className="text-muted">Public US price data. Data was last imported on {c.meta.importedAt || "an unknown date"}.</p>
        </div>
        <CopyTextButton text={costSummaryText(c)} label="Copy cost summary" />
      </div>

      <section aria-labelledby="list-price">
        <Card>
          <SectionHeading>List price: pharmacy acquisition cost (NADAC)</SectionHeading>
          <p className="mb-3 text-muted">
            What retail pharmacies pay to buy the drug, from Medicaid&apos;s weekly National Average Drug Acquisition Cost survey.
            Cash prices at the counter are usually higher because they add a dispensing fee and markup.
          </p>
          {c.generic.length + c.brand.length === 0 ? (
            <p>No NADAC prices were found for {c.drug}. It may be dispensed mainly by specialty pharmacies or in hospitals.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-6">
                {c.genericRange && (
                  <p>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-gold-text">Generic</span>
                    <span className="text-2xl font-semibold tabular-nums">
                      {money(c.genericRange.min)}
                      {c.genericRange.max !== c.genericRange.min && `–${money(c.genericRange.max)}`}
                    </span>{" "}
                    <span className="text-muted">{unitLabel(c.genericRange.unit)}</span>
                  </p>
                )}
                {c.brandRange && (
                  <p>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-gold-text">Brand</span>
                    <span className="text-2xl font-semibold tabular-nums">
                      {money(c.brandRange.min)}
                      {c.brandRange.max !== c.brandRange.min && `–${money(c.brandRange.max)}`}
                    </span>{" "}
                    <span className="text-muted">{unitLabel(c.brandRange.unit)}</span>
                  </p>
                )}
              </div>
              <PriceTable prices={allPrices.slice(0, 8)} />
              {allPrices.length > 8 && (
                <details className="mt-3">
                  <summary className="font-medium text-navy">Show {allPrices.length - 8} more strengths and forms</summary>
                  <div className="mt-2">
                    <PriceTable prices={allPrices.slice(8)} />
                  </div>
                </details>
              )}
            </>
          )}
          <Updated>
            Pricing as of {c.nadacAsOf || "unknown"} · Last updated {c.meta.importedAt || "unknown"} ·{" "}
            <SourceLink href="https://data.medicaid.gov/nadac">NADAC on data.medicaid.gov</SourceLink>
          </Updated>
        </Card>
      </section>

      <section aria-labelledby="insurer-cost">
        <Card>
          <SectionHeading>Insurer cost: Medicare Part D ({c.partDYear || "latest year"})</SectionHeading>
          <p className="mb-3 text-muted">
            Gross drug cost paid under Medicare Part D: the plan&apos;s payment and the patient&apos;s share together, before
            manufacturer rebates.
          </p>
          {c.partD.length === 0 ? (
            <p>{c.drug} does not appear in the Medicare Part D spending data, for example because it is given in a clinic.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-left text-[0.95rem]">
                <thead className="bg-cream">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Product</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Per fill</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Per unit</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Per patient per year</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Patients</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Total spending</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Unit cost vs prior year</th>
                  </tr>
                </thead>
                <tbody>
                  {c.partD.map((r) => (
                    <tr key={r.brand} className="border-t border-line">
                      <td className="px-3 py-1.5">
                        {r.brand}
                        {r.brand.toLowerCase() === r.generic.toLowerCase() ? <span className="text-muted"> (generic)</span> : null}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(r.avgPerClaim)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(r.avgPerUnit)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(r.avgPerBeneficiary)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.beneficiaries.toLocaleString("en-US")}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(r.totalSpending)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.changePerUnit === undefined ? "–" : `${r.changePerUnit > 0 ? "+" : ""}${(r.changePerUnit * 100).toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Updated>
            Pricing year {c.partDYear || "unknown"} · Last updated {c.meta.importedAt || "unknown"} ·{" "}
            <SourceLink href="https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-d-spending-by-drug">
              CMS Part D Spending by Drug
            </SourceLink>
          </Updated>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading>Patient out-of-pocket estimate</SectionHeading>
          <p className="flex gap-2">
            <Info aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
            <span>
              Not available from free public data. A patient&apos;s cost depends on their plan&apos;s tier, deductible and
              coinsurance. For uninsured patients, generics usually cost a little more than the NADAC price above plus a
              dispensing fee.
            </span>
          </p>
          <p className="mt-2 text-muted">Planned: licensed retail price data (for example from a pricing vendor).</p>
        </Card>
        <Card>
          <SectionHeading>Coverage by plan</SectionHeading>
          <p className="flex gap-2">
            <Info aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
            <span>
              Pricing data unavailable for individual plans. Medicare plan formularies are published by CMS as large quarterly
              files; adding them is the next step for this tab. Commercial plan coverage needs licensed data.
            </span>
          </p>
        </Card>
      </div>

      {c.comparison.length > 0 && (
        <section aria-labelledby="class-compare">
          <Card>
            <SectionHeading>Same-mechanism comparison: {c.drugClass}</SectionHeading>
            <p className="mb-3 text-muted">Drugs in the same FDA pharmacologic class, cheapest Medicare cost per fill first.</p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-left text-[0.95rem]">
                <thead className="bg-cream">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Drug</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Generic, per unit (NADAC)</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Brand, per unit (NADAC)</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Medicare per fill</th>
                  </tr>
                </thead>
                <tbody>
                  {c.comparison.map((d) => (
                    <tr key={d.name} className={d.isThisDrug ? "border-t border-line bg-[#f5eddf] font-semibold" : "border-t border-line"}>
                      <td className="px-3 py-1.5">
                        {titleCase(d.name)} {d.isThisDrug && <Badge tone="ai">This drug</Badge>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.genericPerUnit !== undefined ? money(d.genericPerUnit) : "–"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.brandPerUnit !== undefined ? money(d.brandPerUnit) : "–"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.medicarePerClaim !== undefined ? money(d.medicarePerClaim) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Updated>
              NADAC as of {c.nadacAsOf} · Medicare {c.partDYear} · Class from the FDA label (openFDA)
            </Updated>
          </Card>
        </section>
      )}
    </div>
  );
}
