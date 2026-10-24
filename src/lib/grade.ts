import { isAboutCondition } from "./study-features";
import type { Article, DesignCounts, GradeAssessment, GradeDomain, GradeLevel, LabelStatus, PublishedRating, Trial } from "./types";

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
  "needs-condition": {
    label: "Not rated",
    definition: "Certainty is rated for a specific use. Add the patient's condition to rate the evidence for it.",
  },
};

const ORDER: GradeLevel[] = ["high", "moderate", "low", "very-low"];

/** Fewer participants than this across the evidence is treated as imprecise (GRADE's optimal information size rule of thumb). */
export const MIN_PARTICIPANTS = 400;

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? singular : pluralForm}`;
}

export function countsFromStudies(studies: Article[]): DesignCounts {
  const n = (...d: Article["design"][]) => studies.filter((a) => d.includes(a.design)).length;
  return {
    metaAnalyses: n("meta-analysis", "systematic-review"),
    rcts: n("rct"),
    nonRandomized: n("clinical-trial"),
    observational: n("observational"),
    caseReports: n("case-report", "case-series"),
  };
}

export function describeCounts(c: DesignCounts): string {
  const parts = [
    c.metaAnalyses && plural(c.metaAnalyses, "meta-analysis or systematic review", "meta-analyses or systematic reviews"),
    c.rcts && plural(c.rcts, "randomized trial"),
    c.nonRandomized && plural(c.nonRandomized, "non-randomized trial"),
    c.observational && plural(c.observational, "observational study", "observational studies"),
    c.caseReports && plural(c.caseReports, "case report"),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "no clinical studies";
}

export interface GradeInput {
  condition?: string;
  /** Full PubMed counts for studies where the drug is a main topic; null when counting failed. */
  counts: DesignCounts | null;
  /** Fetched peer-reviewed studies where the drug is a main topic (any design). */
  rated: Article[];
  /** The condition and its MeSH synonyms, for the indirectness check. */
  conditionPhrases: string[];
  /** True when AI has judged each study's direction of effect. */
  directionsAssessed: boolean;
}

function domain(name: GradeDomain["name"], status: GradeDomain["status"], reason: string): GradeDomain {
  return { name, status, reason };
}

/**
 * GRADE certainty for the body of evidence on one drug for one condition.
 * Starts from study design (randomized -> High, otherwise Low), then lowers one level for each
 * domain with a concern that can be checked from abstracts, registries and funding records.
 */
export function assessGrade(input: GradeInput): GradeAssessment {
  const { condition, rated, conditionPhrases, directionsAssessed } = input;
  const counts = input.counts ?? countsFromStudies(rated);
  const found = `In MEDLINE, with the drug as a main topic: ${describeCounts(counts)}.`;

  if (!condition) {
    return { level: "needs-condition", ...DEFINITIONS["needs-condition"], rationale: [found], domains: [] };
  }

  let start: GradeLevel;
  const rationale = [found];
  if (counts.rcts > 0) {
    start = "high";
    rationale.push("Starts at High because randomized trials exist.");
  } else if (counts.metaAnalyses + counts.nonRandomized + counts.observational > 0) {
    start = "low";
    rationale.push("Starts at Low because no randomized trials were found, so the evidence is non-randomized.");
  } else if (counts.caseReports > 0) {
    rationale.push("Rated Very low because only case reports were found.");
    return { level: "very-low", ...DEFINITIONS["very-low"], startLevel: "very-low", rationale, domains: [] };
  } else {
    return { level: "insufficient", ...DEFINITIONS.insufficient, rationale, domains: [] };
  }

  const clinical = rated.filter((a) => a.peerReviewed && !["case-report", "case-series", "review", "other"].includes(a.design));
  const trials = clinical.filter((a) => a.design === "rct");
  const reviews = clinical.filter((a) => a.design === "meta-analysis" || a.design === "systematic-review");
  const domains: GradeDomain[] = [];

  // Risk of bias: masking stated in randomized trial abstracts.
  if (start === "high") {
    const known = trials.filter((a) => a.blinding);
    const open = known.filter((a) => a.blinding === "open-label").length;
    if (known.length >= 2 && open / known.length > 0.5) {
      domains.push(domain("Risk of bias", "downgraded", `${open} of ${known.length} trials that state their masking were open-label.`));
    } else if (known.length === 0) {
      domains.push(domain("Risk of bias", "not-assessed", "The trial abstracts do not state whether they were blinded."));
    } else {
      domains.push(domain("Risk of bias", "no-concern", `${known.length - open} of ${known.length} trials that state their masking were blinded.`));
    }
  } else {
    domains.push(domain("Risk of bias", "not-assessed", "Bias in non-randomized studies needs a full-text review."));
  }

  // Inconsistency: direction of each study's result, judged by AI from its abstract.
  if (directionsAssessed) {
    const favors = clinical.filter((a) => a.direction === "favors").length;
    const against = clinical.filter((a) => a.direction === "against").length;
    const neutral = clinical.filter((a) => a.direction === "neutral").length;
    if (favors > 0 && against > 0 && Math.min(favors, against) / (favors + against) >= 0.25) {
      domains.push(domain("Inconsistency", "downgraded", `Results point in different directions: ${favors} favour the drug, ${against} favour the comparison.`));
    } else if (favors + against + neutral === 0) {
      domains.push(domain("Inconsistency", "not-assessed", "No study's direction of effect could be read from its abstract."));
    } else {
      domains.push(domain("Inconsistency", "no-concern", `Results agree in direction: ${favors} favour the drug, ${neutral} show no difference, ${against} favour the comparison.`));
    }
  } else {
    domains.push(domain("Inconsistency", "not-assessed", "Whether study results agree could not be checked automatically. Compare the conclusions of the studies below."));
  }

  // Indirectness: are the studies mainly about this condition?
  if (clinical.length >= 2) {
    const direct = clinical.filter((a) => isAboutCondition(a, conditionPhrases)).length;
    if (direct / clinical.length < 0.5) {
      domains.push(domain("Indirectness", "downgraded", `Only ${direct} of ${clinical.length} studies are mainly about ${condition}; the rest only mention it.`));
    } else {
      domains.push(domain("Indirectness", "no-concern", `${direct} of ${clinical.length} studies are mainly about ${condition}.`));
    }
  } else {
    domains.push(domain("Indirectness", "not-assessed", "Too few studies to judge."));
  }

  // Imprecision: how many participants the evidence rests on.
  const pooled = Math.max(0, ...reviews.map((a) => a.sampleSize ?? 0));
  const trialTotal = trials.reduce((sum, a) => sum + (a.sampleSize ?? 0), 0);
  const participants = Math.max(pooled, trialTotal);
  if (start === "high" && counts.rcts === 1 && counts.metaAnalyses === 0) {
    domains.push(domain("Imprecision", "downgraded", "The evidence rests on a single randomized trial."));
  } else if (participants === 0) {
    domains.push(domain("Imprecision", "not-assessed", "Participant numbers are not stated in the abstracts."));
  } else if (participants < MIN_PARTICIPANTS) {
    domains.push(domain("Imprecision", "downgraded", `About ${participants.toLocaleString("en-US")} participants across the studies shown, fewer than ${MIN_PARTICIPANTS}.`));
  } else {
    domains.push(domain("Imprecision", "no-concern", `About ${participants.toLocaleString("en-US")} participants${pooled ? " in the largest pooled analysis" : " across the trials shown"}.`));
  }

  // Publication bias: evidence dominated by industry funding.
  const knownFunding = clinical.filter((a) => a.funding.kind !== "unreported");
  const industry = knownFunding.filter((a) => a.funding.kind === "industry").length;
  if (knownFunding.length < 3) {
    domains.push(domain("Publication bias", "not-assessed", "Funding is known for too few studies to judge."));
  } else if (industry / knownFunding.length >= 0.6) {
    domains.push(domain("Publication bias", "downgraded", `${industry} of ${knownFunding.length} studies with known funding are industry-funded.`));
  } else {
    domains.push(domain("Publication bias", "no-concern", `${industry} of ${knownFunding.length} studies with known funding are industry-funded.`));
  }

  const downgrades = Math.min(3, domains.filter((d) => d.status === "downgraded").length);
  let level = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(start) + downgrades)];
  if (downgrades > 0) {
    const names = domains.filter((d) => d.status === "downgraded").map((d) => d.name.toLowerCase());
    rationale.push(`Lowered ${plural(downgrades, "level")} for ${names.join(", ")}.`);
  }

  // Reviewers who graded the evidence themselves read the full trials, so their ratings set the bounds.
  const published = publishedRatings(reviews, conditionPhrases);
  if (published.length) {
    const levels = published.flatMap((p) => p.levels).map((l) => ORDER.indexOf(l));
    const best = ORDER[Math.min(...levels)];
    const worst = ORDER[Math.max(...levels)];
    const who = published.some((p) => p.cochrane) ? "Cochrane and other systematic reviews" : "Systematic reviews";
    if (ORDER.indexOf(level) < ORDER.indexOf(best)) {
      rationale.push(`Set to ${DEFINITIONS[best].label} to match the published ratings: ${who.toLowerCase()} of this use rate the evidence at most ${DEFINITIONS[best].label.toLowerCase()}.`);
      level = best;
    } else if (ORDER.indexOf(level) > ORDER.indexOf(worst)) {
      rationale.push(`Set to ${DEFINITIONS[worst].label} to match the published ratings: ${who.toLowerCase()} of this use rate the evidence at least ${DEFINITIONS[worst].label.toLowerCase()}.`);
      level = worst;
    } else {
      rationale.push(`Consistent with the published ratings from ${who.toLowerCase()} of this use.`);
    }
  }
  return { level, ...DEFINITIONS[level], startLevel: start, rationale, domains, published };
}

/** Reviews of this condition whose abstracts state GRADE ratings; Cochrane first, then newest. */
export function publishedRatings(reviews: Article[], conditionPhrases: string[]): PublishedRating[] {
  return reviews
    .filter((a) => a.statedCertainty?.length && isAboutCondition(a, conditionPhrases))
    .sort((a, b) => Number(b.cochrane) - Number(a.cochrane) || b.year.localeCompare(a.year))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      label: `${a.authors.split(",")[0] || "Review"} ${a.year}`.trim(),
      url: a.url,
      cochrane: a.cochrane,
      levels: a.statedCertainty ?? [],
    }));
}

/** GRADE's standard wording for a finding at each certainty level. */
export function verdict(level: GradeLevel, drug: string, condition: string | undefined, counts: DesignCounts): string {
  const topic = condition ? `${drug} for ${condition}` : drug;
  switch (level) {
    case "high":
      return `High certainty evidence on ${topic}, based on ${describeCounts(counts)}.`;
    case "moderate":
      return `Moderate certainty evidence on ${topic}: probably reliable, but new studies could change the estimate. Based on ${describeCounts(counts)}.`;
    case "low":
      return `Low certainty evidence on ${topic}: the true effect may be substantially different. Based on ${describeCounts(counts)}.`;
    case "very-low":
      return `Very low certainty evidence on ${topic}: we are very uncertain about the effect. Based on ${describeCounts(counts)}.`;
    case "insufficient":
      return `No peer-reviewed clinical studies of ${topic} were found.`;
    case "needs-condition":
      return `Add the patient's condition to rate the evidence for ${drug}. PubMed has ${describeCounts(counts)} with ${drug} as a main topic.`;
  }
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
    case "needs-condition":
      lines.push(`Certainty depends on what ${drug} is used for. Add the patient's condition to see how certain the evidence is for that use.`);
      break;
  }
  for (const d of grade.domains.filter((x) => x.status === "downgraded")) {
    lines.push(`${d.name}: ${d.reason}`);
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
