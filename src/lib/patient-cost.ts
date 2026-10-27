// What a patient is likely to pay for a month of a drug, by how they are covered, in words a physician can pass on.
// Built only from public data (NADAC, Medicare plan formularies, Medicare spending, Part B limits) and published
// benefit rules; every figure says what it is based on.
import type { CoverageStats } from "./cost-details";
import type { PartBLimit, PartBSpendingRow, PartDRow } from "./cost-data";
import type { ClassComparison, NadacPrice } from "./costs";
import { PART_D_2026 } from "./medicare-benefit";

export interface CoverageCost {
  who: "cash" | "medicare" | "medicaid" | "employer" | "clinic";
  title: string;
  /** Headline amount, e.g. "about $12" or "$0–$8". */
  amount: string;
  /** "for 30 tablets", "per fill" … */
  per: string;
  detail: string[];
}

export interface PatientCostInput {
  drug: string;
  generic: NadacPrice[];
  brand: NadacPrice[];
  partD: PartDRow[];
  coverage: CoverageStats | null;
  partB: PartBLimit[];
  partBSpending: PartBSpendingRow[];
  comparison: ClassComparison[];
  genericSold: boolean;
  biosimilars: string[];
  insulin: boolean;
  negotiated30Day?: number;
  brandHolders: string[];
}

export interface PatientCost {
  /** The product the monthly figures are for, e.g. "metformin 500 mg tablet". */
  basis?: string;
  costs: CoverageCost[];
  lowerCost: string[];
  /** Plain-language summary to read or give to the patient. */
  script: string;
}

const round = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 100) / 100);
export function usd(n: number): string {
  const r = round(n);
  return Number.isInteger(r) ? `$${r.toLocaleString("en-US")}` : `$${r.toFixed(2)}`;
}

/** Usual starter and titration packs are not a typical month. */
const PACK = /starter|titration|dose pack|kit/i;

/** The cheapest everyday tablet or capsule (priced each), generic first, for a 30-unit month. */
export function referenceProduct(generic: NadacPrice[], brand: NadacPrice[]): NadacPrice | undefined {
  const each = (list: NadacPrice[]) => list.filter((p) => p.unit === "EA" && !PACK.test(p.description)).sort((a, b) => a.perUnit - b.perUnit)[0];
  return each(generic) ?? each(brand);
}

/** Employer plan averages, KFF Employer Health Benefits Survey 2024 (copays by formulary tier). */
export const EMPLOYER_COPAYS = { generic: 11, preferred: 35, nonPreferred: 64, specialty: 121, sourceUrl: "https://www.kff.org/health-costs/report/2024-employer-health-benefits-survey/" };

export function patientCosts(i: PatientCostInput): PatientCost {
  const ref = referenceProduct(i.genericSold ? i.generic : [], i.brand);
  const isGeneric = Boolean(ref && !ref.brand);
  const genRow = i.partD.find((r) => r.brand.toLowerCase() === r.generic.toLowerCase());
  const brandRow = i.partD.find((r) => r !== genRow);
  // Full price of a fill (what plans and patients pay together): Medicare's average for the product most patients get.
  const fullFill = (isGeneric ? genRow : brandRow ?? genRow)?.avgPerClaim ?? genRow?.avgPerClaim;
  const pharmacyCost = ref ? ref.perUnit * 30 : undefined;
  const costs: CoverageCost[] = [];
  const clinicOnly = !ref && !fullFill && (i.partB.length > 0 || i.partBSpending.length > 0);
  const specialty = (fullFill ?? 0) > 950;

  // No insurance
  if (pharmacyCost !== undefined) {
    const low = pharmacyCost * 1.15 + 5;
    costs.push({
      who: "cash",
      title: "No insurance (cash)",
      amount: isGeneric ? `about ${usd(Math.max(low, 6))}` : `${usd(pharmacyCost)} or more`,
      per: "for 30 tablets or capsules",
      detail: isGeneric
        ? [
            `Pharmacies pay about ${usd(pharmacyCost)} for 30 (NADAC).`,
            `Low-markup and discount-card prices are often close to cost plus 15% and a small fee (about ${usd(Math.max(low, 6))}); regular counter prices can be several times higher, so ask for the discount price.`,
          ]
        : [`Pharmacies pay about ${usd(pharmacyCost)} for 30 of the brand (NADAC); the counter price is usually higher. Ask about the manufacturer's savings program.`],
    });
  } else if (fullFill) {
    costs.push({ who: "cash", title: "No insurance (cash)", amount: `about ${usd(fullFill)} or more`, per: "per fill", detail: ["Based on the average full price of a fill in Medicare (plan and patient together). Ask the manufacturer about assistance."] });
  }

  // Medicare Part D
  const o = i.coverage;
  if (o && o.plans > 0) {
    const covered = o.covered / o.plans;
    const usesCopay = o.copayPlans >= o.coinsurancePlans && o.medianCopay !== undefined;
    const share = i.insulin
      ? Math.min(PART_D_2026.insulinMonthlyCap, fullFill ?? PART_D_2026.insulinMonthlyCap)
      : usesCopay
        ? (o.medianCopay as number)
        : o.medianCoinsurance !== undefined && fullFill
          ? o.medianCoinsurance * fullFill
          : undefined;
    const detail = [
      `Covered by ${Math.round(covered * 100)}% of Medicare drug plans${o.priorAuth ? `; ${Math.round((o.priorAuth / Math.max(1, o.covered)) * 100)}% of those need prior authorization` : ""}.`,
    ];
    if (i.insulin) detail.push(`Covered insulin costs no more than $${PART_D_2026.insulinMonthlyCap} a month.`);
    else {
      if (!usesCopay && o.medianCoinsurance !== undefined) detail.push(`Most plans charge ${Math.round(o.medianCoinsurance * 100)}% of the price.`);
      detail.push(`Some plans charge the full price until the ${usd(PART_D_2026.deductible)} yearly deductible is met. No one pays more than ${usd(PART_D_2026.outOfPocketCap)} a year for covered drugs (${PART_D_2026.year}).`);
    }
    detail.push(`With Extra Help (limited income): at most ${usd(PART_D_2026.extraHelp.generic)} for a generic or ${usd(PART_D_2026.extraHelp.brand)} for a brand.`);
    costs.push({
      who: "medicare",
      title: "Medicare drug plan",
      amount: share !== undefined ? `about ${usd(share)}` : covered > 0 ? "varies by plan" : "usually not covered",
      per: "per month, after the deductible",
      detail,
    });
  }

  // Medicaid
  costs.push({
    who: "medicaid",
    title: "Medicaid",
    amount: "$0–$8",
    per: "per prescription",
    detail: ["Federal rules cap Medicaid copays at a few dollars; many states charge nothing. Each state has a preferred drug list, and drugs not on it may need prior authorization."],
  });

  // Employer and Marketplace plans
  const tierCopay = isGeneric ? EMPLOYER_COPAYS.generic : specialty ? EMPLOYER_COPAYS.specialty : EMPLOYER_COPAYS.preferred;
  costs.push({
    who: "employer",
    title: "Employer or Marketplace plan",
    amount: specialty && !isGeneric ? "often 20–30% of the price" : `about ${usd(tierCopay)}${isGeneric ? "" : `–${usd(EMPLOYER_COPAYS.nonPreferred)}`}`,
    per: "per month, depending on the plan's tier",
    detail: [
      isGeneric
        ? `Generics are usually on the lowest tier; employer plans averaged ${usd(EMPLOYER_COPAYS.generic)} per prescription (KFF 2024).`
        : specialty
          ? `Specialty drugs are often charged as coinsurance; the employer plan average specialty copay was ${usd(EMPLOYER_COPAYS.specialty)} (KFF 2024). A deductible may apply first.`
          : `Brand drugs averaged ${usd(EMPLOYER_COPAYS.preferred)} on a preferred tier and ${usd(EMPLOYER_COPAYS.nonPreferred)} on a non-preferred tier (KFF 2024).`,
      "Check the plan's drug list (formulary) for the exact tier and any prior authorization.",
    ],
  });

  // Given in a clinic (Medicare Part B)
  const clinic = i.partBSpending[0];
  if (clinic && (clinicOnly || clinic.beneficiaries > (i.partD[0]?.beneficiaries ?? 0))) {
    costs.unshift({
      who: "clinic",
      title: "Given in a clinic (Medicare Part B)",
      amount: `about ${usd(clinic.avgPerClaim * 0.2)}`,
      per: "per treatment visit",
      detail: [
        `Medicare Part B pays 80% after the yearly deductible; the patient's 20% share of an average claim (${usd(clinic.avgPerClaim)}) is shown.`,
        "A Medigap (supplement) plan or Medicaid often pays this share.",
      ],
    });
  }

  const lowerCost: string[] = [];
  if (i.genericSold && i.brand.length > 0 && i.generic.length > 0) lowerCost.push("Prescribe the generic: it costs far less than the brand.");
  if (i.biosimilars.length) lowerCost.push(`Biosimilars are available (${i.biosimilars.slice(0, 3).join(", ")}) and are often cheaper or preferred by plans.`);
  if (isGeneric) lowerCost.push("A 90-day supply or a mail-order or low-markup pharmacy usually lowers the cost per month.");
  const cheaper = i.comparison.filter((c) => !c.isThisDrug && c.medicarePerClaim !== undefined && fullFill !== undefined && c.medicarePerClaim < fullFill * 0.6).slice(0, 3);
  if (cheaper.length) lowerCost.push(`Cheaper drugs in the same class, if suitable: ${cheaper.map((c) => `${c.name} (about ${usd(c.medicarePerClaim as number)} a fill)`).join(", ")}.`);
  if (!isGeneric && i.brandHolders.length) lowerCost.push(`Commercially insured patients can ask ${i.brandHolders[0]} about a copay savings card (not allowed with Medicare or Medicaid).`);
  if (!isGeneric) lowerCost.push("Patients with low income may qualify for the manufacturer's free-drug (patient assistance) program.");
  if (i.negotiated30Day) lowerCost.push(`Medicare's negotiated price (${usd(i.negotiated30Day)} for 30 days) lowers what Medicare patients pay at the pharmacy.`);
  lowerCost.push("Medicare patients can spread costs into monthly payments with the Medicare Prescription Payment Plan.");

  const pick = (who: CoverageCost["who"]) => costs.find((c) => c.who === who);
  const parts = [`${i.drug[0].toUpperCase()}${i.drug.slice(1)} usually costs`];
  const said: string[] = [];
  const cash = pick("cash");
  const medicare = pick("medicare");
  const clinicCost = pick("clinic");
  if (clinicCost) said.push(`${clinicCost.amount} per visit with Medicare when given in the clinic`);
  if (medicare && medicare.amount.startsWith("about")) said.push(`${medicare.amount} a month with a Medicare drug plan`);
  if (cash) said.push(`${cash.amount} ${cash.per} without insurance`);
  said.push("$0–$8 with Medicaid");
  const script = `${parts[0]} ${said.join(", ")}. Your exact cost depends on your plan, so ask your pharmacy or check your plan's drug list. ${lowerCost[0] ?? ""}`.trim();

  return { basis: ref ? ref.description.toLowerCase() : undefined, costs, lowerCost, script };
}
