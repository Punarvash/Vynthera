import Image from "next/image";
import Link from "next/link";
import { isDemoMode } from "@/lib/http";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="no-print z-40 sm:sticky sm:top-0 border-b border-line bg-surface/95 shadow-[0_1px_0_rgba(31,36,44,0.04),0_6px_18px_-12px_rgba(33,59,85,0.35)] backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-navy focus:px-3 focus:py-2 focus:text-cream">
        Skip to content
      </a>
      {isDemoMode() && (
        <p className="bg-[#8a1c12] px-4 py-1.5 text-center text-sm font-semibold text-white">
          Demo data mode: everything shown is placeholder content, not real studies.
        </p>
      )}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Vynthera home">
          <Image src="/vynthera-logo.png" alt="" width={30} height={30} priority />
          <span className="font-display text-[1.4rem] font-extrabold tracking-tight text-navy">Vynthera</span>
        </Link>
        {children && <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">{children}</div>}
      </div>
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-navy via-gold to-sky" />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-ink text-[#c5ccd6]">
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-navy via-gold to-sky" />
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-10 text-[0.92rem] leading-relaxed">
        <p>
          <strong className="text-white">Medical disclaimer.</strong> Vynthera is an information tool for licensed physicians. It
          does not provide medical advice, diagnosis or treatment, and it does not replace clinical judgement. AI-generated and
          automated summaries can be wrong or incomplete: always check the original sources linked beside each claim. Off-label
          status is determined by matching the FDA label text and may miss synonyms.
        </p>
        <p>
          <strong className="text-white">Privacy.</strong> Vynthera does not store patient information. Patient details typed into
          the letter tool stay in your browser and are never sent to our servers or to any AI service.
        </p>
        <p className="text-[#9aa5b4]">
          Data: openFDA and DailyMed, PubMed and Europe PMC (NLM, EMBL-EBI), ClinicalTrials.gov, Open Targets Platform. Draft
          disclaimer wording, pending legal review.
        </p>
      </div>
    </footer>
  );
}
