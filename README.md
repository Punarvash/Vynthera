# Vynthera

Drug evidence for busy physicians: search a drug, condition or mechanism and get, in three clicks or fewer, the published evidence, its GRADE certainty, who funded it, and whether the use is off-label. Every claim links to its source.

## What works now (build 1)

- **Home search.** One box that accepts a drug, condition or mechanism, plus an optional patient condition. A drug name goes straight to its page; a condition or mechanism lists matching drugs (FDA label indications, FDA pharmacologic classes, Open Targets).
- **Drug page.** A summary card with mechanism, evidence strength (GRADE), cost range (placeholder) and off-label flag. Below it is a summary of the evidence: written by Claude when an API key is set, otherwise quoted from the abstracts. Then the six tabs, always in the same order.
- **Evidence tab.**
  - GRADE certainty with its reasoning, and a plain statement of what is uncertain.
  - FDA approval status, checked against the label's Indications section.
  - MEDLINE-indexed studies, ordered by study design.
  - ClinicalTrials.gov trials.
  - Preprints, labelled as not peer reviewed.
  - Funding badges (industry-funded, independent, or not reported) on every study.
  - **Generate letter:** a medical necessity letter, pre-filled from the evidence. Patient details stay in the browser only.
- **Cases tab.** Case reports from MEDLINE-indexed journals (and case preprints), with funding badges and **Copy citations**.
- Manufacturer, Costs, Specialists and Patient info tabs show what is planned. They will be built after this one is reviewed.

## How judgements are made

| Judgement | Rule | Code |
|---|---|---|
| Evidence certainty | GRADE starting certainty from study design. Randomized → High (one lone trial → Moderate for imprecision), observational → Low, case reports only → Very low. Preprints are shown but not counted. Risk of bias, inconsistency, indirectness and publication bias are listed as "not assessed". | `src/lib/grade.ts` |
| Off-label | The condition is matched against the FDA label's Indications and Usage text. Text under "Limitations of Use" never counts as approval. Synonyms can be missed, so the page always links the label. | `src/lib/label-status.ts` |
| Funding | 1) sponsor class of a linked ClinicalTrials.gov trial; 2) funding agencies on the PubMed record. Anything else is "Funding not reported", never a guess. | `src/lib/funding.ts` |
| "Credentialed journals" | PubMed `medline[sb]` (MEDLINE-indexed). Preprints come from Europe PMC (`SRC:PPR`) and are badged. | `src/lib/sources/` |

## Run it

```bash
npm install
cp .env.example .env.local   # all keys optional
npm run dev                  # http://localhost:3000
npm run dev:demo             # offline, with clearly marked placeholder data
npm test && npm run lint && npm run typecheck
```

## Deploy (Vercel free tier)

1. Import this GitHub repo at vercel.com/new. The defaults work.
2. Under Settings → Environment Variables, add `NCBI_API_KEY` and `OPENFDA_API_KEY` (both free), and later `ANTHROPIC_API_KEY`.
3. Deploy. Source data is cached per server instance for a day (`"use cache"` with `cacheLife("days")`), so repeat searches are fast and stay within the free API limits.

## Data sources

openFDA / DailyMed (labels), PubMed E-utilities (MEDLINE literature), Europe PMC (preprints), ClinicalTrials.gov API v2 (trials, sponsors), Open Targets Platform (mechanisms, condition and target → drug).

## Privacy

No database and no accounts in this build. Patient details in the letter tool live only in browser memory. Only public literature is sent to Claude.

## Next builds

Physician sign-in with NPI verification; Costs (CMS Part D, NADAC, formulary files, weekly import); Patient info (label, MedlinePlus, toxicology); Manufacturer; Specialists (NPPES plus self-reported experience).
