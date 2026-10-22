import type { Article, GradeAssessment, GradeLevel, LabelStatus, Trial } from "./types";

// GRADE (Grading of Recommendations, Assessment, Development and Evaluation) is the single
// grading scale used across Vynthera. Definitions follow the GRADE Handbook, section 5.
const DEFINITIONS: Record<GradeLevel, { label: string; definition: string }> = {
  high: {
    label: "High",
    definition: "We are very confident that the true effect lies close to the estimate of the effect.",
  },
  moderate: {
    label: "Moderate",
    definition:
      "We are moderately confident in the effect estimate: the true effect is likely to be close to it, but it may be substantially different.",
  },
  low: {
    label: "Low",
    definition: "Our confidence in the effect estimate is limited: the true effect may be substantially different.",
  },
  "very-low": {
    label: "Very low",
    definition: "We have very little confidence in the effect estimate: the true effect is likely to be substantially different.",
  },
  insufficient: {
    label: "No rating",
    definition: "No peer-reviewed clinical studies were found, so certainty cannot be rated.",
  },
};

const NOT_ASSESSED = [
  "Risk of bias in individual studies",
  "Inconsistency between study results",
  "Indirectness (population, dose or outcome differs from your patient)",
  "Publication bias",
];

function count(articles: Article[], ...designs: Article["design"][]): number {
  return articles.filter((a) => designs.includes(a.design)).length;
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/**
 * A design-based GRADE starting rating for the body of evidence.
 * Randomized evidence starts High; observational evidence starts Low; case reports Very low.
 * The only downgrade applied automatically is imprecision when a single randomized trial
 * stands alone. Other GRADE domains need a reader's judgement and are listed as not assessed.
 */
export function assessGrade(articles: Article[]): GradeAssessment {
  const peer = articles.filter((a) => a.peerReviewed);
  const preprints = articles.length - peer.length;
  const meta = count(peer, "meta-analysis", "systematic-review");
  const rct = count(peer, "rct");
  const nonRandomized = count(peer, "clinical-trial", "observational");
  const cases = count(peer, "case-report", "case-series");

  const found: string[] = [];
  if (meta) found.push(plural(meta, "meta-analysis or systematic review", "meta-analyses or systematic reviews"));
  if (rct) found.push(plural(rct, "randomized trial"));
  if (nonRandomized) found.push(plural(nonRandomized, "non-randomized or observational study", "non-randomized or observational studies"));
  if (cases) found.push(plural(cases, "case report"));

  const rationale: string[] = [];
  if (found.length) rationale.push(`Found in MEDLINE: ${found.join(", ")}.`);

  let level: GradeLevel;
  if (rct >= 2 || (meta >= 1 && rct >= 1)) {
    level = "high";
    rationale.push("Starts at High because randomized evidence is available.");
  } else if (rct === 1 || meta >= 1) {
    level = "moderate";
    rationale.push(
      rct === 1
        ? "Starts at High for randomized evidence, lowered one level because a single trial is imprecise."
        : "Reviews were found, but no randomized trials among the top results, so it is rated Moderate. Check whether the reviews pool randomized trials.",
    );
  } else if (nonRandomized) {
    level = "low";
    rationale.push("Starts at Low because the evidence is non-randomized.");
  } else if (cases) {
    level = "very-low";
    rationale.push("Rated Very low because only case reports were found.");
  } else {
    level = "insufficient";
  }

  if (preprints > 0) {
    rationale.push(`${plural(preprints, "preprint")} not peer reviewed ${preprints === 1 ? "was" : "were"} shown but not counted.`);
  }

  return { level, ...DEFINITIONS[level], rationale, notAssessed: level === "insufficient" ? [] : NOT_ASSESSED };
}

/**
 * A plain statement of what is and is not known, in the style used by GRADE summary-of-findings
 * tables and evidence services: what was found, how certain it is, and what would change it.
 */
export function uncertaintyStatement(input: {
  drug: string;
  condition?: string;
  grade: GradeAssessment;
  articles: Article[];
  trials: Trial[];
  labelStatus: LabelStatus;
}): string[] {
  const { drug, condition, grade, articles, trials, labelStatus } = input;
  const topic = condition ? `${drug} for ${condition}` : drug;
  const lines: string[] = [];

  switch (grade.level) {
    case "high":
      lines.push(`The evidence for ${topic} is of high certainty. New studies are unlikely to change the overall conclusion, but individual patients may still respond differently.`);
      break;
    case "moderate":
      lines.push(`The evidence for ${topic} is of moderate certainty. Further research may change the size of the effect.`);
      break;
    case "low":
      lines.push(`The evidence for ${topic} is of low certainty. It may help, but well-designed randomized trials are lacking and could change this conclusion.`);
      break;
    case "very-low":
      lines.push(`We are very uncertain about ${topic}. The evidence comes from individual case reports, which cannot show whether the drug caused the outcome.`);
      break;
    case "insufficient":
      lines.push(`No peer-reviewed clinical studies of ${topic} were found. This means it has not been studied, not that it does not work.`);
      break;
  }

  const peer = articles.filter((a) => a.peerReviewed);
  const industry = peer.filter((a) => a.funding.kind === "industry").length;
  const unreported = peer.filter((a) => a.funding.kind === "unreported").length;
  if (peer.length > 0 && industry / peer.length >= 0.5) {
    lines.push(`At least half of the studies shown were funded by industry.`);
  }
  if (peer.length > 0 && unreported / peer.length >= 0.5) {
    lines.push(`Funding is not reported in the indexed records for most studies; check the full articles.`);
  }

  const ongoing = trials.filter((t) => /RECRUITING|NOT_YET_RECRUITING|ACTIVE_NOT_RECRUITING|ENROLLING_BY_INVITATION/.test(t.status)).length;
  if (ongoing > 0) {
    lines.push(`${plural(ongoing, "registered trial")} ${ongoing === 1 ? "is" : "are"} still ongoing, so this summary may change.`);
  }

  if (labelStatus.kind === "off-label") {
    lines.push("This use is off-label: the FDA has not reviewed its safety and effectiveness for this condition.");
  }

  return lines;
}
