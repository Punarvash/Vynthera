import { BadgeCheck, FlaskConical, Mail, MapPin, Phone, Printer, Stethoscope, Syringe, Users } from "lucide-react";
import { CopyTextButton } from "./copy-text";
import { SourceProblems } from "./source-problems";
import { Badge, Card, SectionHeading, SourceLink } from "./ui";
import { getSpecialists, SPECIALTIES, US_STATES, type Specialist, type SpecialistFilters } from "@/lib/specialists";
import type { TrialSite } from "@/lib/sources/trial-sites";
import { titleCase } from "@/lib/text";

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

export async function SpecialistsTab({ drug, condition, filters }: { drug: string; condition?: string; filters: SpecialistFilters }) {
  const b = await getSpecialists(drug, condition, filters);
  const local = Boolean(b.filters.state);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Specialists for second opinions</h2>
        <p className="text-muted">
          Clinicians with real experience, ranked by how often they treat Medicare patients with these drugs, never by payments. Contact
          details come from the federal NPI Registry and ClinicalTrials.gov. Contact them directly; Vynthera does not pass messages.
        </p>
      </div>
      <Card>
        <FilterForm drug={drug} condition={condition} filters={b.filters} />
        {!local && <p className="mt-3 text-sm text-muted">Showing the most experienced clinicians nationwide. Add a ZIP code or state to find someone nearby.</p>}
      </Card>
      <SourceProblems problems={b.problems} />

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
                {b.specialties.length ? `${b.specialties.join(", ")} clinicians` : "Clinicians"} in {b.where} who most often prescribe drugs used for {condition}
                {b.conditionDrugs.length ? ` (${b.conditionDrugs.slice(0, 6).join(", ")})` : ""}.
              </p>
              <SpecialistList
                items={b.conditionExperts}
                what="Prescribed"
                year={b.dataYear}
                empty={
                  b.specialties.length
                    ? `No ${b.specialties.join(" or ")} clinicians with Medicare prescribing records for these drugs were found in ${b.where}. Try a nearby city, the whole state, or another specialty.`
                    : "Choose a specialty above to find clinicians who treat this condition."
                }
              />
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
              Experienced with {b.drug}
            </span>
          </SectionHeading>
          <p className="mb-3 text-muted">Clinicians in {b.where} who prescribe {b.drug} most often to Medicare patients.</p>
          <SpecialistList
            items={b.drugExperts}
            what="Prescribed"
            year={b.dataYear}
            empty={`No Medicare prescribing records for ${b.drug} in ${b.where}. Drugs given in clinics, or rarely prescribed in Medicare, may not appear here${b.administrators.length ? "; see the clinic list below" : ""}.`}
          />
        </Card>
      </section>

      {b.administrators.length > 0 && (
        <section aria-labelledby="sp-admin">
          <Card>
            <SectionHeading>
              <span id="sp-admin" className="flex items-center gap-2">
                <Syringe aria-hidden className="size-5 text-gold-text" />
                Gives {b.drug} in the clinic
              </span>
            </SectionHeading>
            <p className="mb-3 text-muted">Clinicians in {b.where} who gave {b.drug} to the most Medicare patients (infusions and injections, Medicare Part B).</p>
            <SpecialistList items={b.administrators} what="Gave" year={b.partBYear} empty="" />
          </Card>
        </section>
      )}

      <section aria-labelledby="sp-trials">
        <Card>
          <SectionHeading>
            <span id="sp-trials" className="flex items-center gap-2">
              <FlaskConical aria-hidden className="size-5 text-gold-text" />
              Clinical trial sites {local ? `in ${b.filters.state}` : "in the United States"}
            </span>
          </SectionHeading>
          <p className="mb-3 text-muted">
            Recruiting studies of {condition ? `${b.drug} or ${condition}` : b.drug}, with the investigators and contacts each study publishes.
          </p>
          {b.trials.length ? <TrialList sites={b.trials} /> : <p className="text-muted">No recruiting study sites were found{local ? ` in ${b.filters.state}` : ""}.</p>}
        </Card>
      </section>

      <p className="text-sm text-muted">
        Prescribing counts come from CMS &ldquo;Medicare Part D Prescribers by Provider and Drug&rdquo; and clinic use from &ldquo;Medicare Physician &amp; Other
        Practitioners&rdquo;; CMS hides counts under 11 to protect privacy. Industry payments to any clinician can be checked on{" "}
        <SourceLink href="https://openpaymentsdata.cms.gov/">CMS Open Payments</SourceLink>; they play no part in this ranking.
      </p>
    </div>
  );
}
