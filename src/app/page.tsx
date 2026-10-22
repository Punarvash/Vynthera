import Image from "next/image";
import { SearchForm } from "@/components/search-form";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-14 sm:pt-20">
        <div className="mb-8 text-center">
          <Image src="/vynthera-logo.png" alt="" width={64} height={64} className="mx-auto mb-4" priority />
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Evidence for every prescription</h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
            Search a drug, condition or mechanism. See the evidence, its certainty, who funded it and whether the use is off-label,
            with a source link beside every claim.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7">
          <SearchForm />
        </div>
        <ul className="mt-8 grid gap-3 text-[0.95rem] text-muted sm:grid-cols-3">
          <li className="rounded-lg border border-line bg-surface/60 p-3">
            <strong className="block text-ink">Graded with GRADE</strong>
            Certainty of evidence on the standard scale.
          </li>
          <li className="rounded-lg border border-line bg-surface/60 p-3">
            <strong className="block text-ink">Funding labelled</strong>
            Industry-funded and independent research marked.
          </li>
          <li className="rounded-lg border border-line bg-surface/60 p-3">
            <strong className="block text-ink">Off-label flagged</strong>
            Checked against the FDA label.
          </li>
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
