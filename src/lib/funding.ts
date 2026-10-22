import { isIndependent, isIndustry } from "./sources/clinicaltrials";
import type { Article, Funding, Trial } from "./types";

const COMPANY_WORDS =
  /\b(pharma\w*|therapeutics|biotech\w*|biosciences|biologics|inc|ltd|llc|gmbh|plc|corp(oration)?|co\.? ltd|laboratories|s\.?a\.?|ag|kk)\b/i;

const KNOWN_COMPANIES = [
  "pfizer", "novartis", "roche", "genentech", "merck", "msd", "sanofi", "glaxosmithkline", "gsk",
  "astrazeneca", "johnson & johnson", "janssen", "abbvie", "bristol-myers", "bristol myers", "eli lilly",
  "lilly", "novo nordisk", "bayer", "boehringer", "takeda", "amgen", "gilead", "biogen", "regeneron",
  "teva", "viatris", "mylan", "sandoz", "astellas", "daiichi", "eisai", "otsuka", "vertex", "moderna",
  "biontech", "allergan", "ipsen", "servier", "lundbeck", "ucb", "grifols", "csl", "sun pharma", "cipla",
];

/** Public/non-profit funders that commonly contain company-like words ("Inc", "Ltd"). */
const NON_PROFIT_HINTS = /\b(foundation|trust|society|association|council|institute|ministry|university|hospital|nih|nhs|national|government|charity|fund)\b/i;

export function isIndustryAgency(agency: string, manufacturers: string[] = []): boolean {
  const a = agency.toLowerCase();
  if (manufacturers.some((m) => m && a.includes(m.toLowerCase().split(/[ ,]/)[0]))) return true;
  if (KNOWN_COMPANIES.some((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(a))) return true;
  return COMPANY_WORDS.test(agency) && !NON_PROFIT_HINTS.test(agency);
}

/**
 * Label who paid for a study. Evidence used, strongest first:
 *  1. the lead sponsor class of a linked ClinicalTrials.gov registration,
 *  2. funding agencies listed on the PubMed record.
 * Anything we cannot see is reported as "Funding not reported" rather than guessed.
 */
export function classifyFunding(article: Article, trialsById: Map<string, Trial>, manufacturers: string[]): Funding {
  const linked = article.nctIds.map((id) => trialsById.get(id)).filter((t): t is Trial => t !== undefined);
  const industryTrial = linked.find((t) => isIndustry(t.sponsorClass));
  if (industryTrial) {
    return { kind: "industry", reason: `Registered trial ${industryTrial.nctId} is sponsored by ${industryTrial.sponsor}` };
  }
  const industryGrant = article.grantAgencies.find((g) => isIndustryAgency(g, manufacturers));
  if (industryGrant) {
    return { kind: "industry", reason: `Funding listed from ${industryGrant}` };
  }
  const independentTrial = linked.find((t) => isIndependent(t.sponsorClass));
  if (independentTrial) {
    return { kind: "independent", reason: `Registered trial ${independentTrial.nctId} is sponsored by ${independentTrial.sponsor}` };
  }
  if (article.grantAgencies.length > 0) {
    return { kind: "independent", reason: `Funding listed from ${article.grantAgencies.slice(0, 2).join(", ")}` };
  }
  return { kind: "unreported", reason: "No funder listed in the indexed record; check the full text" };
}

export function trialFunding(t: Trial): Funding {
  if (isIndustry(t.sponsorClass)) return { kind: "industry", reason: `Lead sponsor: ${t.sponsor}` };
  if (isIndependent(t.sponsorClass)) return { kind: "independent", reason: `Lead sponsor: ${t.sponsor}` };
  return { kind: "unreported", reason: `Sponsor type not reported (${t.sponsor})` };
}

/** True when the drug's own manufacturer sponsored or funded the work. */
export function isManufacturerResearch(funding: Funding, manufacturers: string[]): boolean {
  if (funding.kind !== "industry") return false;
  const r = funding.reason.toLowerCase();
  return manufacturers.some((m) => m && r.includes(m.toLowerCase().split(/[ ,]/)[0]));
}
