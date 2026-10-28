import Image from "next/image";
import { BadgeCheck, CircleDollarSign, FileSearch, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import { SearchForm } from "@/components/search-form";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const FEATURES = [
  { icon: FileSearch, title: "Graded with GRADE", text: "Certainty of evidence on the standard scale, with the reasons shown." },
  { icon: BadgeCheck, title: "Funding labelled", text: "Industry-funded and independent research clearly marked." },
  { icon: ShieldCheck, title: "Off-label flagged", text: "Each use checked against the FDA label." },
  { icon: CircleDollarSign, title: "Real costs", text: "Pharmacy prices and coverage across every Medicare drug plan." },
  { icon: Stethoscope, title: "Experienced specialists", text: "Clinicians who prescribe the drug most, with contact details." },
  { icon: UserRound, title: "Patient handouts", text: "Plain-language guidance, ready to print." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="w-full flex-1">
        <section className="relative overflow-hidden bg-gradient-to-br from-navy via-[#1d4370] to-gold pb-28 pt-14 text-white sm:pt-20">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-sky/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-sky/10 blur-3xl" />
          <div className="relative mx-auto max-w-3xl px-4 text-center">
            <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-white shadow-lg">
              <Image src="/vynthera-logo.png" alt="" width={40} height={40} priority />
            </span>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky">Drug evidence for physicians</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Evidence for every prescription</h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[#d6e2f1]">
              Search a drug, condition or mechanism. See the evidence, its certainty, who funded it and whether the use is off-label,
              with a source link beside every claim.
            </p>
          </div>
        </section>
        <div className="relative mx-auto -mt-20 max-w-3xl px-4">
          <div className="rounded-2xl border border-line/70 bg-surface p-5 shadow-[0_20px_50px_-20px_rgba(33,59,85,0.45)] sm:p-7">
            <SearchForm />
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-xl border border-line/80 bg-surface p-4 shadow-[0_1px_2px_rgba(31,36,44,0.05)]">
                <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-cream text-gold-text">
                  <Icon aria-hidden className="size-5" />
                </span>
                <strong className="block font-display text-ink">{title}</strong>
                <span className="text-[0.95rem] text-muted">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
