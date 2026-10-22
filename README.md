# Vynthera

Drug evidence for busy physicians: search a drug, condition or mechanism and get, in three clicks or fewer, the published evidence, its GRADE certainty, who funded it, and whether the use is off-label. Every claim links to its source.

## What it does

- **Home search.** One box that accepts a drug, condition or mechanism, plus an optional patient condition. A drug name goes straight to its page; a condition or mechanism lists matching drugs (FDA label indications, FDA pharmacologic classes, Open Targets).
- **Drug page.** A summary card with mechanism, evidence strength (GRADE), cost range and off-label flag. Below it is a summary of the evidence: written by Claude when an API key is set, otherwise quoted from the abstracts. Then six tabs, always in the same order:
  - **Evidence:** GRADE certainty with its reasoning; a plain "what is uncertain" statement; FDA approval status; MEDLINE studies by design; ClinicalTrials.gov trials; badged preprints; funding badges. **Generate letter** creates a medical necessity letter; patient details stay in the browser.
  - **Cases:** published case reports (and case preprints) with funding badges. **Copy citations**.
  - **Manufacturer:** brand (NDA/BLA) and generic (ANDA) holders from Drugs@FDA; trials run by the manufacturer; MEDLINE articles with manufacturer-affiliated authors or funding, labelled.
  - **Costs:** pharmacy acquisition cost per strength (Medicaid NADAC, weekly); Medicare Part D cost per fill, per unit and per patient; same-class comparison; "last updated" on every figure. Out-of-pocket and per-plan coverage are marked unavailable (no free source yet). **Copy cost summary**.
  - **Specialists:** clinicians in a chosen state, city and specialty who prescribed the drug in Medicare Part D, most experienced first, with NPI Registry-verified specialty, address and a **Call** button. No messaging through the site.
  - **Patient info:** physician view (boxed warning, mechanism, dosage, side-effect table with frequencies, warnings, trial counts, animal toxicology) and a plain-language patient view (benefits, risks, drawbacks, questions to ask), with **Print handout**.

## Automated jobs (GitHub Actions)

| Workflow | When | What |
|---|---|---|
| Import cost data | Mondays 06:17 UTC, or **Actions → Import cost data → Run workflow** | Downloads the newest NADAC and Medicare Part D Spending datasets into `data/costs/` and commits them. Also records the Part D Prescribers API used by Specialists. If one source fails, last week's data is kept and the run is marked failed. |
| Live smoke test | Manual only | Builds the site and loads every tab against the real APIs, printing what each tab shows and any unavailable source. |

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

openFDA / DailyMed (labels, Drugs@FDA), PubMed E-utilities (MEDLINE literature), Europe PMC (preprints), ClinicalTrials.gov API v2 (trials, sponsors), Open Targets Platform (mechanisms, condition and target → drug), MedlinePlus Connect (patient information), Medicaid NADAC and CMS Medicare Part D Spending (costs), CMS Part D Prescribers by Provider and Drug and the NPPES NPI Registry (specialists).

## Privacy

No database and no accounts. Patient details in the letter tool live only in browser memory. Only public literature is sent to Claude.

## Next builds

Physician sign-in with NPI verification, which also enables self-reported experience on the Specialists tab; Medicare plan coverage from CMS formulary files; licensed retail price data for out-of-pocket estimates.
