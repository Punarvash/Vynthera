// Medicare Part D standard benefit for 2026, as set by CMS under the Inflation Reduction Act.
// Source: CMS CY 2026 Part D redesign program instructions; summarized for patients on Medicare.gov.

export const PART_D_2026 = {
  year: 2026,
  deductible: 615,
  coinsurance: 0.25,
  outOfPocketCap: 2100,
  /** Monthly cap on covered insulin under Part D. */
  insulinMonthlyCap: 35,
  /** Extra Help (Low-Income Subsidy) maximum copays for full-benefit enrollees. */
  extraHelp: { generic: 5.1, brand: 12.65 },
  sourceUrl: "https://www.medicare.gov/drug-coverage-part-d/costs-for-medicare-drug-coverage",
} as const;

export interface PartDEstimate {
  /** Gross yearly cost of the drug (plan and patient together). */
  yearlyGross: number;
  /** What the patient pays in the year under the standard benefit. */
  yearlyPatient: number;
  /** Patient's cost for the first fill of the year, when the deductible applies. */
  firstFill: number;
  /** Patient's cost for a fill once the deductible is met. */
  laterFill: number;
  /** True when the yearly cap is reached. */
  hitsCap: boolean;
}

/**
 * Patient cost under the 2026 standard Part D benefit for a drug costing `perFill` per fill,
 * filled `fillsPerYear` times, with no other drugs counting toward the deductible.
 * Real plans use tiered copays and may waive the deductible for generics, so this is an estimate.
 */
export function estimatePartD(perFill: number, fillsPerYear: number, options: { insulin?: boolean } = {}): PartDEstimate {
  const b = PART_D_2026;
  const yearlyGross = perFill * fillsPerYear;
  if (options.insulin) {
    const fill = Math.min(perFill, b.insulinMonthlyCap);
    return { yearlyGross, yearlyPatient: Math.min(fill * fillsPerYear, b.outOfPocketCap), firstFill: fill, laterFill: fill, hitsCap: false };
  }
  const patientShare = (gross: number) => Math.min(gross, b.deductible) + b.coinsurance * Math.max(0, gross - b.deductible);
  const yearlyPatient = Math.min(patientShare(yearlyGross), b.outOfPocketCap);
  return {
    yearlyGross,
    yearlyPatient,
    firstFill: Math.min(patientShare(perFill), b.outOfPocketCap),
    laterFill: Math.min(b.coinsurance * perFill, b.outOfPocketCap),
    hitsCap: patientShare(yearlyGross) >= b.outOfPocketCap,
  };
}
