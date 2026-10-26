import { BadgeCheck, CalendarClock, ExternalLink, Info, PiggyBank, ShieldCheck } from "lucide-react";
import { CopyTextButton } from "./copy-text";
import { CostCalculator, type CalculatorProduct } from "./cost-calculator";
import { DataTable } from "./data-table";
import { InfoTip } from "./info-tip";
import { MarketplaceLookup } from "./marketplace-lookup";
import { PriceTrendChart } from "./price-trend";
import { SourceProblems } from "./source-problems";
import { Badge, Card, SectionHeading, SourceLink } from "./ui";
import type { CostDetails, CoverageStats } from "@/lib/cost-details";
import { dollars, formatProduct, money, unitLabel, type NadacPrice } from "@/lib/costs";
import type { PartDRow } from "@/lib/cost-data";
import { loadCostDetails } from "@/lib/loaders";
import { PART_D_2026 } from "@/lib/medicare-benefit";
import { titleCase } from "@/lib/text";

function Updated({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-muted">
      <CalendarClock aria-hidden className="size-4" /> {children}
    </p>
  );
}

function pct(n: number, of: number): string {
  return of ? `${Math.round((n / of) * 100)}%` : "–";
}

/** Plans number tiers themselves; these are the usual meanings in the CMS model formulary structure. */
const TIER_HINT: Record<number, string> = {
  1: "preferred generic",
  2: "generic",
  3: "preferred brand",
  4: "non-preferred drug",
  5: "specialty",
  6: "select care",
};

function tierText(tier: number): string {
  return tier ? `Tier ${tier}${TIER_HINT[tier] ? ` (${TIER_HINT[tier]})` : ""}` : "–";
}

/** "$0 copay" or "25% coinsurance (about $12)", whichever most covering plans use. */
function typicalCost(s: CoverageStats, perFill?: number): string {
  if (s.covered === 0) return "–";
  if (s.copayPlans >= s.coinsurancePlans && s.medianCopay !== undefined) return `${dollars(s.medianCopay)} copay`;
  if (s.medianCoinsurance !== undefined) {
    const share = perFill ? perFill * s.medianCoinsurance : 0;
    const est = share ? ` (about ${money(Math.min(share, PART_D_2026.outOfPocketCap))}${share * 12 > PART_D_2026.outOfPocketCap ? `, up to the ${dollars(PART_D_2026.outOfPocketCap)} yearly cap` : ""})` : "";
    return `${Math.round(s.medianCoinsurance * 100)}% coinsurance${est}`;
  }
  return s.medianCopay !== undefined ? `${dollars(s.medianCopay)} copay` : "–";
}

function Tile({ label, value, note, tip }: { label: string; value: string; note?: string; tip?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-gold-text">
        {label}
        {tip}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </div>
  );
}

function genericRow(rows: PartDRow[]): PartDRow | undefined {
  return rows.find((r) => r.brand.toLowerCase() === r.generic.toLowerCase());
}

function costSummaryText(c: CostDetails): string {
  const lines = [`Estimated costs for ${c.drug}`];
  if (c.genericRange) lines.push(`Generic pharmacy acquisition cost (NADAC): ${money(c.genericRange.min)}–${money(c.genericRange.max)} ${unitLabel(c.genericRange.unit)}, as of ${c.nadacAsOf}.`);
  if (c.brandRange) lines.push(`Brand pharmacy acquisition cost (NADAC): ${money(c.brandRange.min)}–${money(c.brandRange.max)} ${unitLabel(c.brandRange.unit)}.`);
  if (c.coverage) {
    const o = c.coverage.overall;
    lines.push(`Medicare Part D ${c.coverage.year}: covered by ${o.covered} of ${o.plans} plans (${pct(o.covered, o.plans)}), usually ${tierText(o.tier)}; prior authorization in ${pct(o.priorAuth, o.covered)} of covering plans.`);
  }
  for (const r of c.partD.slice(0, 3)) lines.push(`Medicare Part D ${c.partDYear}, ${r.brand}: average ${money(r.avgPerClaim)} per fill (plan and patient combined).`);
  if (c.negotiated.current) lines.push(`Medicare negotiated price: ${money(c.negotiated.current.price30Day)} per 30-day supply from ${c.negotiated.current.effective}.`);
  for (const r of c.partB.slice(0, 3)) lines.push(`Medicare Part B payment limit ${r.hcpcs} (${r.description}): ${money(r.limit)} per ${r.dosage || "unit"}, ${c.partBQuarter}.`);
  lines.push("Patient cost depends on the plan; confirm with the pharmacy or insurer.");
  return lines.join("\n");
}

function NadacTable({ prices }: { prices: NadacPrice[] }) {
  return (
    <DataTable
      caption="Pharmacy acquisition cost (NADAC) by product"
      rows={prices}
      rowKey={(p) => p.description}
      columns={[
        { header: "Product", primary: true, cell: (p) => formatProduct(p.description) },
        { header: "Type", cell: (p) => `${p.brand ? "Brand" : "Generic"}${p.otc ? ", OTC" : ""}` },
        { header: "Per unit", align: "right", cell: (p) => `${money(p.perUnit)} /${p.unit.toLowerCase()}` },
        { header: "30 units", align: "right", cell: (p) => (p.unit === "EA" ? money(p.perUnit * 30) : "–") },
        { header: "Price date", cell: (p) => p.effectiveDate },
      ]}
    />
  );
}

export async function CostsTab({ drug }: { drug: string }) {
  const c = await loadCostDetails(drug);
  const allPrices = [...c.generic, ...c.brand];

  if (!c.imported) {
    return (
      <Card>
        <h2 className="text-2xl font-semibold">Costs</h2>
        <p className="mt-2">Cost data is being refreshed. Please check back shortly.</p>
      </Card>
    );
  }

  const gen = genericRow(c.partD);
  const brandRows = c.partD.filter((r) => r !== gen);
  const topB = c.partBSpending[0];
  // Clinic-given drugs (infliximab) reach far more patients under Part B than Part D.
  const topD = topB && topB.beneficiaries > (c.partD[0]?.beneficiaries ?? 0) ? undefined : c.partD[0];
  const insulin = /^insulin\b/i.test(c.drug);
  const products: CalculatorProduct[] = allPrices.slice(0, 30).map((p) => ({ label: formatProduct(p.description), perUnit: p.perUnit, unit: p.unit, brand: p.brand }));
  const o = c.coverage?.overall;
  // Approved generics can be held back by patents (apixaban); count them as sold only with pharmacy or Medicare data.
  const genericSold = c.generic.length > 0 || Boolean(gen);
  const perFill = gen?.avgPerClaim ?? topD?.avgPerClaim;

  return (
    <div className="space-y-8">
      <SourceProblems problems={c.problems} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">What {c.drug} costs</h2>
          <p className="text-muted">Public US price and coverage data, refreshed weekly. Last updated {c.meta.importedAt || "recently"}.</p>
        </div>
        <CopyTextButton text={costSummaryText(c)} label="Copy cost summary" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Pharmacy cost"
          tip={<InfoTip term="nadac" label="NADAC" />}
          value={c.genericRange ? `${money(c.genericRange.min)}` : c.brandRange ? money(c.brandRange.min) : "–"}
          note={
            c.genericRange
              ? `Generic, ${unitLabel(c.genericRange.unit)}${c.brandRange ? `; brand from ${money(c.brandRange.min)}` : ""}`
              : c.brandRange
                ? `Brand, ${unitLabel(c.brandRange.unit)}`
                : "Not sold through retail pharmacies"
          }
        />
        <Tile
          label="Medicare cost per patient"
          tip={<InfoTip term={topD ? "partD" : "partB"} label={topD ? "Medicare Part D" : "Medicare Part B"} />}
          value={topD ? `${money(topD.avgPerBeneficiary)} / year` : topB ? `${money(topB.avgPerBeneficiary)} / year` : "–"}
          note={topD ? `${topD.brand}, Part D ${c.partDYear}, plan and patient together` : topB ? `${topB.brand || topB.generic}, Part B ${c.partBSpendingYear}, given in a clinic` : "Not in Medicare spending data"}
        />
        <Tile
          label="Medicare plan coverage"
          value={o ? pct(o.covered, o.plans) : "–"}
          note={
            o
              ? `${o.covered.toLocaleString("en-US")} of ${o.plans.toLocaleString("en-US")} drug plans; usually ${tierText(o.tier).toLowerCase()}${o.priorAuth ? `, prior authorization in ${pct(o.priorAuth, o.covered)}` : ""}`
              : "Not on Medicare drug plan formularies"
          }
        />
      </div>

      {(c.availability || c.negotiated.current || c.negotiated.next) && (
        <div className="flex flex-wrap gap-2">
          {c.availability && c.availability.genericMakers > 0 && genericSold && (
            <Badge tone="approved">
              <BadgeCheck aria-hidden className="size-3.5" /> Generic available from {c.availability.genericMakers} maker{c.availability.genericMakers === 1 ? "" : "s"}
            </Badge>
          )}
          {c.availability && c.availability.genericMakers > 0 && !genericSold && (
            <Badge tone="neutral" title="FDA-approved generics with no pharmacy or Medicare sales recorded yet, often because of patents">
              Generic approved, not yet sold
            </Badge>
          )}
          {c.availability && c.availability.genericMakers === 0 && c.availability.biosimilars.length === 0 && <Badge tone="neutral">No generic marketed</Badge>}
          {c.availability && c.availability.biosimilars.length > 0 && (
            <Badge tone="approved" title={c.availability.biosimilars.join(", ")}>
              <BadgeCheck aria-hidden className="size-3.5" /> {c.availability.biosimilars.length} biosimilar{c.availability.biosimilars.length === 1 ? "" : "s"} marketed
            </Badge>
          )}
          {c.negotiated.current && (
            <Badge tone="ai">
              <ShieldCheck aria-hidden className="size-3.5" /> Medicare negotiated price in effect
            </Badge>
          )}
        </div>
      )}

      {(c.negotiated.current || c.negotiated.next) && (
        <Card>
          <SectionHeading>
            Medicare negotiated price
            <InfoTip term="negotiated" label="negotiated price" />
          </SectionHeading>
          <ul className="space-y-1">
            {c.negotiated.current && (
              <li>
                <span className="text-xl font-semibold tabular-nums">{money(c.negotiated.current.price30Day)}</span> per 30-day supply of{" "}
                {titleCase(c.negotiated.current.drug.replace(/;\s*/g, ", "))} since {c.negotiated.current.effective}
                {c.negotiated.current.end ? `, until ${c.negotiated.current.end}` : ""}.
              </li>
            )}
            {c.negotiated.next && (
              <li>
                {c.negotiated.current ? "Then " : ""}
                <span className="text-xl font-semibold tabular-nums">{money(c.negotiated.next.price30Day)}</span> per 30-day supply of{" "}
                {titleCase(c.negotiated.next.drug.replace(/;\s*/g, ", "))} from {c.negotiated.next.effective}.
              </li>
            )}
          </ul>
          <p className="mt-2 text-muted">
            This is what Medicare drug plans pay for the drug. Patients still pay their plan&apos;s copay or coinsurance, which is usually lower as a result.
          </p>
          <Updated>
            <SourceLink href="https://www.cms.gov/initiatives/medicare-prescription-drug-affordability/overview/medicare-drug-price-negotiation-program/selected-drugs-negotiated-prices">
              CMS negotiated prices
            </SourceLink>
          </Updated>
        </Card>
      )}

      {products.length > 0 && (
        <section aria-labelledby="calc">
          <h3 id="calc" className="mb-2 text-xl font-semibold">Estimate a prescription</h3>
          <CostCalculator
            products={products}
            medicarePerUnit={{ generic: gen?.avgPerUnit, brand: brandRows[0]?.avgPerUnit }}
            insulin={insulin}
            planCost={
              o && o.covered
                ? {
                    copay: o.copayPlans >= o.coinsurancePlans ? o.medianCopay : undefined,
                    coinsurance: o.copayPlans < o.coinsurancePlans ? o.medianCoinsurance : undefined,
                    plans: o.plans,
                    covered: o.covered,
                  }
                : undefined
            }
          />
        </section>
      )}

      <section aria-labelledby="coverage">
        <Card>
          <SectionHeading>
            <span id="coverage">Coverage by insurance plan</span>
          </SectionHeading>
          {c.coverage ? (
            <>
              <h4 className="font-semibold">Medicare drug plans ({c.coverage.year}), by insurer</h4>
              <p className="mb-3 text-muted">
                Every Medicare Part D and Medicare Advantage drug plan, from the plans&apos; own formularies filed with CMS. Costs are for a one-month supply
                at a preferred retail pharmacy, after the deductible.
              </p>
              <DataTable
                caption="Medicare drug plan coverage by insurer"
                rows={[{ name: "All Medicare drug plans", ...c.coverage.overall }, ...c.coverage.insurers]}
                rowKey={(r) => r.name}
                highlight={(r) => r.name === "All Medicare drug plans"}
                columns={[
                  { header: "Insurer", primary: true, cell: (r) => r.name },
                  { header: "Plans covering", align: "right", cell: (r) => `${r.covered.toLocaleString("en-US")} of ${r.plans.toLocaleString("en-US")} (${pct(r.covered, r.plans)})` },
                  { header: <>Usual tier<InfoTip term="tier" label="tier" /></>, cell: (r) => (r.covered ? tierText(r.tier) : "Not covered") },
                  { header: <>Prior auth<InfoTip term="priorAuth" label="prior authorization" /></>, align: "right", cell: (r) => (r.covered ? pct(r.priorAuth, r.covered) : "–") },
                  { header: <>Step therapy<InfoTip term="stepTherapy" label="step therapy" /></>, align: "right", cell: (r) => (r.covered ? pct(r.stepTherapy, r.covered) : "–") },
                  { header: "Typical cost", align: "right", cell: (r) => typicalCost(r, perFill) },
                ]}
              />
              <details className="mt-3">
                <summary className="font-medium text-navy">Coverage by state</summary>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4 lg:grid-cols-6">
                  {c.coverage.states.map((s) => (
                    <li key={s.code} className="flex justify-between gap-2 border-b border-line py-0.5">
                      <span>{s.code}</span>
                      <span className="tabular-nums">
                        {pct(s.covered, s.plans)} <span className="text-muted">of {s.plans}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <Updated>
                Plan files of {c.coverage.asOf} · <SourceLink href={c.coverage.sourceUrl}>CMS Part D formulary files</SourceLink> · Compare a patient&apos;s own
                plans on <SourceLink href="https://www.medicare.gov/plan-compare/">Medicare Plan Finder</SourceLink>
              </Updated>
            </>
          ) : (
            <p>{c.drug} is not on Medicare drug plan formularies; it may be covered under Part B when given in a clinic.</p>
          )}

          <h4 className="mt-6 font-semibold">ACA Marketplace plans (HealthCare.gov)</h4>
          {c.marketplace ? (
            <>
              <p className="mb-3 text-muted">Individual-market plans sold on HealthCare.gov, checked against each plan&apos;s drug list.</p>
              <MarketplaceLookup drug={c.drug} />
            </>
          ) : (
            <p className="text-muted">
              Check individual-market plans and their drug lists on <SourceLink href="https://www.healthcare.gov/see-plans/">HealthCare.gov</SourceLink>.
            </p>
          )}

          <h4 className="mt-6 font-semibold">Medicaid and employer plans</h4>
          <p className="text-muted">
            Medicaid pays pharmacies based on the NADAC price below; each state sets its own preferred drug list. Employer plan formularies are not
            published in a common public format, so check the patient&apos;s insurer formulary or call the plan.
          </p>
        </Card>
      </section>

      <section aria-labelledby="list-price">
        <Card>
          <SectionHeading>
            <span id="list-price">Pharmacy cost by product (NADAC)</span>
            <InfoTip term="nadac" label="NADAC" />
          </SectionHeading>
          <p className="mb-3 text-muted">
            What retail pharmacies pay to buy the drug. Cash prices at the counter are usually higher: they add a dispensing fee and markup.
          </p>
          {allPrices.length === 0 ? (
            <p>No pharmacy prices were found for {c.drug}. It may be dispensed mainly by specialty pharmacies or given in clinics.</p>
          ) : (
            <>
              <NadacTable prices={allPrices.slice(0, 8)} />
              {allPrices.length > 8 && (
                <details className="mt-3">
                  <summary className="font-medium text-navy">Show {allPrices.length - 8} more strengths and forms</summary>
                  <div className="mt-2">
                    <NadacTable prices={allPrices.slice(8)} />
                  </div>
                </details>
              )}
            </>
          )}
          <Updated>
            Prices as of {c.nadacAsOf || "unknown"} · <SourceLink href="https://data.medicaid.gov/nadac">NADAC on data.medicaid.gov</SourceLink>
          </Updated>
        </Card>
      </section>

      {c.trends.length > 0 && (
        <Card>
          <SectionHeading>Price trend</SectionHeading>
          <PriceTrendChart trends={c.trends.map((t) => ({ ...t, label: formatProduct(t.description) }))} />
          <Updated>Monthly NADAC, median across pack sizes</Updated>
        </Card>
      )}

      {c.partD.length > 0 && (
        <Card>
          <SectionHeading>
            Medicare Part D spending ({c.partDYear})
            <InfoTip term="partD" label="Medicare Part D" />
          </SectionHeading>
          <p className="mb-3 text-muted">What Medicare drug plans and patients paid together, before manufacturer rebates.</p>
          <DataTable
            caption="Medicare Part D spending by product"
            rows={c.partD}
            rowKey={(r) => r.brand}
            columns={[
              { header: "Product", primary: true, cell: (r) => `${r.brand}${r === gen ? " (generic)" : ""}` },
              { header: "Per fill", align: "right", cell: (r) => money(r.avgPerClaim) },
              { header: "Per unit", align: "right", cell: (r) => money(r.avgPerUnit) },
              { header: "Per patient per year", align: "right", cell: (r) => money(r.avgPerBeneficiary) },
              { header: "Patients", align: "right", cell: (r) => r.beneficiaries.toLocaleString("en-US") },
              { header: "Unit cost vs prior year", align: "right", cell: (r) => (r.changePerUnit === undefined ? "–" : `${r.changePerUnit > 0 ? "+" : ""}${(r.changePerUnit * 100).toFixed(0)}%`) },
            ]}
          />
          <Updated>
            <SourceLink href="https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-d-spending-by-drug">
              CMS Part D Spending by Drug
            </SourceLink>
          </Updated>
        </Card>
      )}

      {(c.partB.length > 0 || c.partBSpending.length > 0) && (
        <Card>
          <SectionHeading>
            Medicare Part B (given in a clinic)
            <InfoTip term="partB" label="Medicare Part B" />
          </SectionHeading>
          {c.partB.length > 0 && (
            <>
              <p className="mb-3 text-muted">
                Medicare&apos;s payment limit per billing unit: the average sales price + 6%
                <InfoTip term="asp" label="average sales price" />. Patients usually pay 20% after the Part B deductible.
              </p>
              <DataTable
                caption="Medicare Part B payment limits"
                rows={c.partB}
                rowKey={(r) => r.hcpcs}
                columns={[
                  { header: "Billing code", primary: true, cell: (r) => `${r.hcpcs} · ${r.description}` },
                  { header: "Unit", cell: (r) => r.dosage || "–" },
                  { header: "Payment limit", align: "right", cell: (r) => money(r.limit) },
                  { header: "Patient share", align: "right", cell: (r) => `${Math.round(r.coinsurance * 100)}%` },
                ]}
              />
              <Updated>
                {c.partBQuarter} · <SourceLink href="https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files">CMS ASP pricing files</SourceLink>
              </Updated>
            </>
          )}
          {c.partBSpending.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 font-semibold">Part B spending ({c.partBSpendingYear})</h4>
              <DataTable
                caption="Medicare Part B spending"
                rows={c.partBSpending.slice(0, 6)}
                rowKey={(r) => `${r.hcpcs}-${r.brand}`}
                columns={[
                  { header: "Product", primary: true, cell: (r) => `${r.brand || r.generic} (${r.hcpcs})` },
                  { header: "Per claim", align: "right", cell: (r) => money(r.avgPerClaim) },
                  { header: "Per patient per year", align: "right", cell: (r) => money(r.avgPerBeneficiary) },
                  { header: "Patients", align: "right", cell: (r) => r.beneficiaries.toLocaleString("en-US") },
                ]}
              />
            </div>
          )}
        </Card>
      )}

      {c.va.length > 0 && (
        <Card>
          <SectionHeading>Federal price benchmark (VA)</SectionHeading>
          <p className="mb-3 text-muted">
            The lowest price the VA and other federal buyers pay under the Federal Supply Schedule. It is far below most commercial prices and shows
            how low the drug can be priced.
          </p>
          <DataTable
            caption="VA Federal Supply Schedule prices"
            rows={c.va.slice(0, 10)}
            rowKey={(r) => r.description}
            columns={[
              { header: "Product", primary: true, cell: (r) => formatProduct(r.description) },
              { header: "Per unit", align: "right", cell: (r) => `${money(r.perUnit)}${r.unit === "PKG" ? " /pack" : r.unit === "EA" ? "" : ` /${r.unit.toLowerCase()}`}` },
              { header: "Contract", cell: (r) => ({ FSS: "Federal Supply Schedule", Big4: "Big Four (VA, DoD, PHS, Coast Guard)", NC: "National contract" })[r.priceType] ?? r.priceType },
            ]}
          />
          <Updated>
            Prices of {c.vaAsOf} ·{" "}
            <SourceLink href="https://department.va.gov/procurement-acquisition-and-logistics/national-acquisition-center/federal-supply-schedule-service/">
              VA National Acquisition Center
            </SourceLink>
          </Updated>
        </Card>
      )}

      {c.comparison.length > 0 && (
        <Card>
          <SectionHeading>Cheaper options in the same class: {c.drugClass}</SectionHeading>
          <p className="mb-3 text-muted">Drugs in the same FDA pharmacologic class, lowest Medicare cost per fill first. Check that an alternative suits the patient.</p>
          <DataTable
            caption="Same-class cost comparison"
            rows={c.comparison}
            rowKey={(d) => d.name}
            highlight={(d) => d.isThisDrug}
            columns={[
              { header: "Drug", primary: true, cell: (d) => `${titleCase(d.name)}${d.isThisDrug ? " (this drug)" : ""}` },
              { header: "Generic per unit", align: "right", cell: (d) => (d.genericPerUnit !== undefined ? money(d.genericPerUnit) : "–") },
              { header: "Brand per unit", align: "right", cell: (d) => (d.brandPerUnit !== undefined ? money(d.brandPerUnit) : "–") },
              { header: "Medicare per fill", align: "right", cell: (d) => (d.medicarePerClaim !== undefined ? money(d.medicarePerClaim) : "–") },
            ]}
          />
          <Updated>
            NADAC as of {c.nadacAsOf} · Medicare {c.partDYear} · Class from the FDA label
          </Updated>
        </Card>
      )}

      <Card>
        <SectionHeading>
          <span className="flex items-center gap-2">
            <PiggyBank aria-hidden className="size-5 text-gold-text" /> Ways to save
          </span>
        </SectionHeading>
        <ul className="space-y-2">
          {genericSold && c.brandRange && c.genericRange && (
            <li className="flex gap-2">
              <Info aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
              <span>A generic is available and costs pharmacies far less than the brand ({money(c.genericRange.min)} vs {money(c.brandRange.min)} per unit).</span>
            </li>
          )}
          {[
            ["Discount card prices", `https://www.goodrx.com/${encodeURIComponent(c.drug.toLowerCase().replace(/\s+/g, "-"))}`, "GoodRx shows cash prices at nearby pharmacies."],
            ["Mark Cuban Cost Plus Drugs", "https://costplusdrugs.com/medications/", "Online pharmacy selling many generics at cost plus 15%."],
            ["Manufacturer assistance", "https://medicineassistancetool.org/", `Patient assistance and copay programs${c.availability?.brandHolders.length ? ` (brand: ${c.availability.brandHolders.slice(0, 2).map(titleCase).join(", ")})` : ""}.`],
            ["NeedyMeds", "https://www.needymeds.org/", "Free directory of assistance programs and drug discount cards."],
            ["Medicare Extra Help", "https://www.ssa.gov/medicare/part-d-extra-help", "Lowers Medicare drug costs for people with limited income."],
            ["Medicare Prescription Payment Plan", "https://www.medicare.gov/prescription-payment-plan", "Spreads Medicare drug costs into monthly payments."],
            ["State drug assistance programs", "https://www.medicare.gov/basics/costs/help/drug-costs", "Some states help pay drug costs."],
          ].map(([title, href, text]) => (
            <li key={title} className="flex gap-2">
              <ExternalLink aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
              <span>
                <SourceLink href={href}>{title}</SourceLink>: {text}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Links open other websites. Vynthera does not share any patient information with them.</p>
      </Card>
    </div>
  );
}
