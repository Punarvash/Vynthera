import { BadgeCheck, BookOpen, FlaskConical, Mail, MapPin, Phone, Printer, Stethoscope, Syringe, Users, BookUser } from "lucide-react";
import { Suspense } from "react";
import { CopyTextButton } from "./copy-text";
import { SourceProblems } from "./source-problems";
import { Badge, Card, LoadingBlock, SectionHeading, SourceLink } from "./ui";
import {
  clinicAdministrators,
  conditionExperts,
  directory,
  drugExperts,
  getSpecialistContext,
  publishedAuthors,
  type PublishedAuthor,
  SPECIALTIES,
  trialInvestigators,
  US_STATES,
  type Specialist,
  type SpecialistContext,
  type SpecialistFilters,
} from "@/lib/specialists";
import type { TrialSite } from "@/lib/sources/trial-sites";
import { titleCase } from "@/lib/text";
import { shortAffiliation } from "@/lib/research-authors";
import type { Provider } from "@/lib/sources/nppes";
import Link from "next/link";

function formatPhone(p?: string): string | undefined {
  const d = p?.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d && d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

function FilterForm({ drug, condition, filters }: { drug: string; condition?: string; filters: SpecialistFilters }) {
  const field = "w-full rounded-lg border border-[#cbbd9f] bg-surface px-3 py-2 focus:border-navy";
  return (
    <form method="get" action={`/drug/${encodeURIComponent(drug)}`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[7rem_7rem_1fr_1fr_auto] lg:items-end">
      <input type="hidden" name="tab" value="specialists" />
      {condition && <input type="hidden" name="condition" value={condition} />}
      <div>
        <label htmlFor="sp-zip" className="mb-1 block font-semibold">
          ZIP code
        </label>
        <input id="sp-zip" name="zip" inputMode="numeric" maxLength={5} autoComplete="postal-code" defaultValue={filters.zip ?? ""} placeholder="77070" className={field} />
      </div>
      <div>
        <label htmlFor="sp-state" className="mb-1 block font-semibold">
          or state
        </label>
        <select id="sp-state" name="state" defaultValue={filters.zip ? "" : (filters.state ?? "")} className={field}>
          <option value="">Any</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sp-city" className="mb-1 block font-semibold">
          City <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="sp-city" name="city" defaultValue={filters.zip ? "" : (filters.city ?? "")} placeholder="e.g. Houston" className={field} />
      </div>
      <div>
        <label htmlFor="sp-specialty" className="mb-1 block font-semibold">
          Specialty <span className="font-normal text-muted">(optional)</span>
        </label>
        <select id="sp-specialty" name="specialty" defaultValue={filters.specialty ?? ""} className={field}>
          <option value="">Matched to the condition</option>
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-lg bg-navy px-5 py-2.5 font-semibold text-cream hover:bg-navy-hover">
        Find specialists
      </button>
    </form>
  );
}

function contactText(s: Specialist): string {
  const p = s.provider;
  const e = s.experience ?? s.administered;
  return [
    `${p?.name ?? titleCase(e?.name ?? "")}${p?.credential ? `, ${p.credential}` : ""}`,
    p?.specialty ?? e?.type,
    p?.address && `${p.address}, ${p.city}`,
    p?.phone && `Phone: ${formatPhone(p.phone)}`,
    p?.fax && `Fax: ${formatPhone(p.fax)}`,
    p?.directAddress && `Direct (secure) address: ${p.directAddress}`,
    `NPI: ${p?.npi ?? e?.npi}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function SpecialistCard({ s, what, year }: { s: Specialist; what: string; year?: number }) {
  const p = s.provider;
  const e = s.experience;
  const a = s.administered;
  const name = p?.name ?? titleCase(e?.name ?? a?.name ?? "Unknown");
  const phone = formatPhone(p?.phone);
  const fax = formatPhone(p?.fax);
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">
            {name}
            {p?.credential ? `, ${p.credential}` : ""}
          </h4>
          <p className="text-muted">{p?.specialty ?? e?.type ?? a?.type}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phone && (
            <a
              href={`tel:${p?.phone?.replace(/\D/g, "")}`}
              className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 font-semibold text-cream hover:bg-navy-hover"
            >
              <Phone aria-hidden className="size-4" /> {phone}
            </a>
          )}
          <CopyTextButton text={contactText(s)} label="Copy contact" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {p && (
          <Badge tone="independent" title="Name, specialty and address verified in the federal NPI Registry">
            <BadgeCheck aria-hidden className="size-3.5" /> NPI verified
          </Badge>
        )}
        {e && (
          <Badge tone="ai">
            {e.claims.toLocaleString("en-US")} Medicare prescriptions{e.patients ? ` for ${e.patients.toLocaleString("en-US")} patients` : ""}
          </Badge>
        )}
        {a && (
          <Badge tone="ai">
            Gave it to {a.patients.toLocaleString("en-US")} Medicare patient{a.patients === 1 ? "" : "s"}
          </Badge>
        )}
      </div>
      {e && (
        <p className="mt-2 text-[0.95rem] text-muted">
          {what}: {e.brands.slice(0, 4).join(", ")} in Medicare Part D, {year ?? "latest year"}. Medicare patients only, so total experience is
          likely higher.
        </p>
      )}
      {a && (
        <p className="mt-2 text-[0.95rem] text-muted">
          Billed Medicare Part B for giving the drug ({a.codes.join(", ")}) in {year ?? "the latest year"}.
        </p>
      )}
      <div className="mt-2 grid gap-1 text-[0.95rem] sm:grid-cols-2">
        {p?.address && (
          <p className="flex items-start gap-1.5">
            <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
            <span>
              {p.address}, {p.city}
            </span>
          </p>
        )}
        {fax && (
          <p className="flex items-center gap-1.5">
            <Printer aria-hidden className="size-4 shrink-0 text-muted" /> Fax {fax}
          </p>
        )}
        {p?.directAddress && (
          <p className="flex items-center gap-1.5 break-all">
            <Mail aria-hidden className="size-4 shrink-0 text-muted" />
            <span>
              Direct (secure clinician messaging): {p.directAddress}
            </span>
          </p>
        )}
      </div>
      <p className="mt-2 text-sm">
        NPI {p?.npi ?? e?.npi ?? a?.npi}
        {p && (
          <>
            {" "}
            · <SourceLink href={p.registryUrl}>NPI Registry record</SourceLink>
          </>
        )}
      </p>
    </article>
  );
}

function SpecialistList({ items, what, year, empty }: { items: Specialist[]; what: string; year?: number; empty: string }) {
  if (items.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((s) => (
        <li key={s.provider?.npi ?? s.experience?.npi ?? s.administered?.npi}>
          <SpecialistCard s={s} what={what} year={year} />
        </li>
      ))}
    </ul>
  );
}

function TrialList({ sites }: { sites: TrialSite[] }) {
  return (
    <ul className="space-y-3">
      {sites.map((t) => (
        <li key={`${t.nctId}-${t.facility}`} className="rounded-lg border border-line bg-surface p-4">
          <p className="font-semibold">{t.facility || "Study site"}</p>
          <p className="text-muted">
            {[t.city, t.state].filter(Boolean).join(", ")}
            {t.status ? ` · ${t.status}` : ""}
          </p>
          <p className="mt-1">
            <SourceLink href={t.url}>{t.title}</SourceLink> <span className="text-sm text-muted">({t.nctId})</span>
          </p>
          {t.people.length > 0 && (
            <ul className="mt-2 space-y-1 text-[0.95rem]">
              {t.people.map((p) => (
                <li key={`${p.name}-${p.role}`}>
                  <span className="font-medium">{p.name}</span> <span className="text-muted">({p.role})</span>
                  {p.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="text-navy underline">
                        {p.phone}
                      </a>
                    </>
                  )}
                  {p.email && (
                    <>
                      {" · "}
                      <a href={`mailto:${p.email}`} className="break-all text-navy underline">
                        {p.email}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

const LOADING = "Searching Medicare records… the first search for a place can take up to 30 seconds.";

async function ConditionSection({ ctx }: { ctx: SpecialistContext }) {
  const r = await conditionExperts(ctx);
  return (
    <>
      <SourceProblems problems={r.problems} />
      {r.note && <p className="mb-3 rounded-lg border border-line bg-cream px-4 py-3 text-[0.95rem]">{r.note}</p>}
      <SpecialistList
        items={r.items}
        what="Prescribed"
        year={ctx.dataYear}
        empty={
          ctx.specialties.length
            ? `No ${ctx.specialties.join(" or ")} clinicians with Medicare prescribing records for these drugs were found in ${ctx.where}. Try a nearby city, the whole state, or another specialty.`
            : "Choose a specialty above to find clinicians who treat this condition."
        }
      />
    </>
  );
}

async function DrugSection({ ctx }: { ctx: SpecialistContext }) {
  const r = await drugExperts(ctx);
  return (
    <>
      <SourceProblems problems={r.problems} />
      {r.note && <p className="mb-3 rounded-lg border border-line bg-cream px-4 py-3 text-[0.95rem]">{r.note}</p>}
      <SpecialistList
        items={r.items}
        what="Prescribed"
        year={ctx.dataYear}
        empty={`No Medicare prescribing records for ${ctx.drug} in ${ctx.where}. Drugs given in clinics, or rarely prescribed in Medicare, may not appear here${ctx.partBCodes.length ? "; see the clinic list below" : ""}.`}
      />
    </>
  );
}

async function ClinicSection({ ctx }: { ctx: SpecialistContext }) {
  const r = await clinicAdministrators(ctx);
  return (
    <>
      <SourceProblems problems={r.problems} />
      <SpecialistList items={r.items} what="Gave" year={ctx.partBYear} empty={`No Medicare Part B records for giving ${ctx.drug} in ${ctx.where}.`} />
    </>
  );
}

async function TrialSection({ ctx }: { ctx: SpecialistContext }) {
  const r = await trialInvestigators(ctx);
  return (
    <>
      <SourceProblems problems={r.problems} />
      {r.items.length ? <TrialList sites={r.items} /> : <p className="text-muted">No recruiting study sites were found{ctx.filters.state ? ` in ${ctx.filters.state}` : ""}.</p>}
    </>
  );
}

function AuthorCard({ a }: { a: PublishedAuthor }) {
  const p = a.provider;
  const phone = formatPhone(p?.phone);
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">
            {p?.name ?? a.author.name}
            {p?.credential ? `, ${p.credential}` : ""}
          </h4>
          <p className="text-muted">{p?.specialty ?? shortAffiliation(a.author.affiliation)}</p>
        </div>
        {phone && (
          <a href={`tel:${p?.phone?.replace(/\D/g, "")}`} className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 font-semibold text-cream hover:bg-navy-hover">
            <Phone aria-hidden className="size-4" /> {phone}
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="ai">
          <BookOpen aria-hidden className="size-3.5" /> {a.author.papers.length} recent stud{a.author.papers.length === 1 ? "y" : "ies"} as lead or senior author
        </Badge>
        {p && (
          <Badge tone="independent" title="One clinician with this name is registered in this state; confirm before contacting">
            <BadgeCheck aria-hidden className="size-3.5" /> NPI match by name and state
          </Badge>
        )}
      </div>
      <p className="mt-2 text-[0.95rem]">{shortAffiliation(a.author.affiliation)}</p>
      <ul className="mt-2 space-y-1 text-[0.95rem]">
        {a.author.papers.slice(0, 3).map((x) => (
          <li key={x.pmid}>
            <SourceLink href={`https://pubmed.ncbi.nlm.nih.gov/${x.pmid}/`}>{x.title}</SourceLink> <span className="text-muted">({x.year})</span>
          </li>
        ))}
      </ul>
      {p?.address && (
        <p className="mt-2 flex items-start gap-1.5 text-[0.95rem]">
          <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-muted" /> {p.address}, {p.city}
          {p.fax ? ` · Fax ${formatPhone(p.fax)}` : ""}
        </p>
      )}
      {p && (
        <p className="mt-1 text-sm">
          NPI {p.npi} · <SourceLink href={p.registryUrl}>NPI Registry record</SourceLink>
        </p>
      )}
    </article>
  );
}

async function AuthorSection({ ctx }: { ctx: SpecialistContext }) {
  const r = await publishedAuthors(ctx);
  return (
    <>
      <SourceProblems problems={r.problems} />
      {r.items.length ? (
        <ul className="space-y-3">
          {r.items.map((a) => (
            <li key={a.author.name}>
              <AuthorCard a={a} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No recent US studies led by clinicians{ctx.filters.state ? ` in ${ctx.filters.state}` : ""} were found for {ctx.drug}.</p>
      )}
    </>
  );
}

function DirectoryRow({ p }: { p: Provider }) {
  const phone = formatPhone(p.phone);
  return (
    <li className="grid gap-1 border-b border-line py-3 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center sm:gap-4">
      <div>
        <p className="font-semibold">
          {p.name}
          {p.credential ? `, ${p.credential}` : ""}
        </p>
        <p className="text-sm text-muted">{p.specialty}</p>
      </div>
      <p className="text-[0.95rem]">
        {p.address ? `${p.address}, ${p.city}` : p.city}
        {p.fax ? <span className="block text-sm text-muted">Fax {formatPhone(p.fax)}</span> : null}
      </p>
      <p className="flex flex-wrap items-center gap-3 text-[0.95rem]">
        {phone && (
          <a href={`tel:${p.phone?.replace(/\D/g, "")}`} className="font-semibold text-navy underline">
            {phone}
          </a>
        )}
        <SourceLink href={p.registryUrl}>NPI {p.npi}</SourceLink>
      </p>
    </li>
  );
}

function pageHref(drug: string, condition: string | undefined, filters: SpecialistFilters, page: number): string {
  const q = new URLSearchParams({ tab: "specialists" });
  if (condition) q.set("condition", condition);
  for (const k of ["zip", "state", "city", "specialty"] as const) if (filters[k]) q.set(k, String(filters[k]));
  if (filters.zip) {
    q.delete("state");
    q.delete("city");
  }
  q.set("page", String(page));
  return `/drug/${encodeURIComponent(drug)}?${q}#sp-directory`;
}

async function DirectorySection({ ctx, rawFilters }: { ctx: SpecialistContext; rawFilters: SpecialistFilters }) {
  const r = await directory(ctx);
  const page = ctx.filters.page ?? 1;
  return (
    <>
      <SourceProblems problems={r.problems} />
      {r.items.length ? (
        <>
          <ul>
            {r.items.map((p) => (
              <DirectoryRow key={p.npi} p={p} />
            ))}
          </ul>
          <nav aria-label="Directory pages" className="mt-3 flex items-center justify-between gap-3">
            {page > 1 ? (
              <Link href={pageHref(ctx.drug, ctx.condition, rawFilters, page - 1)} className="font-semibold text-navy underline">
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted">Page {page}</span>
            {r.hasMore ? (
              <Link href={pageHref(ctx.drug, ctx.condition, rawFilters, page + 1)} className="font-semibold text-navy underline">
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      ) : (
        <p className="text-muted">No {ctx.directorySpecialties.join(" or ")} clinicians are listed in {ctx.where}. Try the whole state or a nearby city.</p>
      )}
    </>
  );
}

export async function SpecialistsTab({ drug, condition, filters }: { drug: string; condition?: string; filters: SpecialistFilters }) {
  const ctx = await getSpecialistContext(drug, condition, filters);
  const local = Boolean(ctx.filters.state);
  // Each list loads on its own, so the quick ones (trial sites) show while Medicare records are searched.
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Specialists for second opinions</h2>
        <p className="text-muted">
          Clinicians with real experience with this drug: Medicare prescribing records, recent published studies and clinical trials, plus a full
          directory of every licensed clinician near the patient. Never ranked by industry payments. Contact details come from the federal NPI
          Registry, PubMed and ClinicalTrials.gov; contact clinicians directly, as Vynthera does not pass messages.
        </p>
      </div>
      <Card>
        <FilterForm drug={drug} condition={condition} filters={ctx.filters} />
        {!local && <p className="mt-3 text-sm text-muted">Showing the most experienced clinicians nationwide. Add a ZIP code or state to find someone nearby.</p>}
      </Card>
      <SourceProblems problems={ctx.problems} />

      <section aria-labelledby="sp-condition">
        <Card>
          <SectionHeading>
            <span id="sp-condition" className="flex items-center gap-2">
              <Stethoscope aria-hidden className="size-5 text-gold-text" />
              {condition ? `Treats ${condition}` : "Treats the patient's condition"}
            </span>
          </SectionHeading>
          {condition ? (
            <>
              <p className="mb-3 text-muted">
                {ctx.specialties.length ? `${ctx.specialties.join(", ")} clinicians` : "Clinicians"} in {ctx.where} who most often prescribe drugs used for {condition}
                {ctx.conditionDrugs.length ? ` (${ctx.conditionDrugs.slice(0, 6).join(", ")})` : ""}.
              </p>
              <Suspense fallback={<LoadingBlock label={LOADING} lines={4} />}>
                <ConditionSection ctx={ctx} />
              </Suspense>
            </>
          ) : (
            <p>Add the patient&apos;s condition at the top of the page to find specialists who treat it, matched by specialty and by the drugs they prescribe for it.</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="sp-drug">
        <Card>
          <SectionHeading>
            <span id="sp-drug" className="flex items-center gap-2">
              <Users aria-hidden className="size-5 text-gold-text" />
              Experienced with {ctx.drug}
            </span>
          </SectionHeading>
          <p className="mb-3 text-muted">Clinicians in {ctx.where} who prescribe {ctx.drug} most often to Medicare patients.</p>
          <Suspense fallback={<LoadingBlock label={LOADING} lines={4} />}>
            <DrugSection ctx={ctx} />
          </Suspense>
        </Card>
      </section>

      <section aria-labelledby="sp-authors">
        <Card>
          <SectionHeading>
            <span id="sp-authors" className="flex items-center gap-2">
              <BookOpen aria-hidden className="size-5 text-gold-text" />
              Published on {ctx.drug}
              {condition ? ` for ${condition}` : ""}
            </span>
          </SectionHeading>
          <p className="mb-3 text-muted">
            Clinicians who led recent US studies (first or senior author, last 6 years){local ? ` in ${ctx.filters.state}` : ""}: experience with any patients, not
            only Medicare. From PubMed; contact details are added when the NPI Registry has exactly one clinician with that name in that state.
          </p>
          <Suspense fallback={<LoadingBlock label="Searching recent studies…" lines={3} />}>
            <AuthorSection ctx={ctx} />
          </Suspense>
        </Card>
      </section>

      {ctx.partBCodes.length > 0 && (
        <section aria-labelledby="sp-admin">
          <Card>
            <SectionHeading>
              <span id="sp-admin" className="flex items-center gap-2">
                <Syringe aria-hidden className="size-5 text-gold-text" />
                Gives {ctx.drug} in the clinic
              </span>
            </SectionHeading>
            <p className="mb-3 text-muted">Clinicians in {ctx.where} who gave {ctx.drug} to the most Medicare patients (infusions and injections, Medicare Part B).</p>
            <Suspense fallback={<LoadingBlock label={LOADING} lines={3} />}>
              <ClinicSection ctx={ctx} />
            </Suspense>
          </Card>
        </section>
      )}

      <section aria-labelledby="sp-trials">
        <Card>
          <SectionHeading>
            <span id="sp-trials" className="flex items-center gap-2">
              <FlaskConical aria-hidden className="size-5 text-gold-text" />
              Clinical trial sites {local ? `in ${ctx.filters.state}` : "in the United States"}
            </span>
          </SectionHeading>
          <p className="mb-3 text-muted">
            Recruiting studies of {condition ? `${ctx.drug} or ${condition}` : ctx.drug}, with the investigators and contacts each study publishes.
          </p>
          <Suspense fallback={<LoadingBlock label="Finding recruiting study sites…" lines={2} />}>
            <TrialSection ctx={ctx} />
          </Suspense>
        </Card>
      </section>

      <section aria-labelledby="sp-directory">
        <Card>
          <SectionHeading>
            <span id="sp-directory" className="flex scroll-mt-4 items-center gap-2">
              <BookUser aria-hidden className="size-5 text-gold-text" />
              Directory: {ctx.directorySpecialties.length ? ctx.directorySpecialties.join(", ") : "specialists"} {local ? `in ${ctx.where}` : ""}
            </span>
          </SectionHeading>
          {local && ctx.directorySpecialties.length > 0 ? (
            <>
              <p className="mb-3 text-muted">
                Every licensed clinician of {ctx.directorySpecialties.length === 1 ? "this specialty" : "these specialties"} listed in the federal NPI Registry, whatever
                insurance they take{condition ? `, matched to ${condition}` : `, chosen from the specialties that prescribe ${ctx.drug} most`}. Not ranked by experience.
              </p>
              <Suspense fallback={<LoadingBlock label="Loading the NPI Registry…" lines={4} />}>
                <DirectorySection ctx={ctx} rawFilters={filters} />
              </Suspense>
            </>
          ) : (
            <p>
              {local
                ? "Choose a specialty above to browse every clinician of that specialty near the patient."
                : "Add a ZIP code or state above to browse every clinician of the matching specialties near the patient, not only those in Medicare."}
            </p>
          )}
        </Card>
      </section>

      <p className="text-sm text-muted">
        Prescribing counts come from CMS &ldquo;Medicare Part D Prescribers by Provider and Drug&rdquo; and clinic use from &ldquo;Medicare Physician &amp; Other
        Practitioners&rdquo;; CMS hides counts under 11 to protect privacy. Addresses and phone numbers are each clinician&apos;s current listing in the NPI
        Registry, which can differ from where they prescribed. Industry payments to any clinician can be checked on{" "}
        <SourceLink href="https://openpaymentsdata.cms.gov/">CMS Open Payments</SourceLink>; they play no part in this ranking.
      </p>
    </div>
  );
}
