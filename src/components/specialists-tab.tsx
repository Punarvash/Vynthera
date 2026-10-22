import { BadgeCheck, MapPin, Phone } from "lucide-react";
import { SourceProblems } from "./source-problems";
import { Badge, Card, SourceLink } from "./ui";
import { getSpecialists, SPECIALTIES, US_STATES, type Specialist, type SpecialistFilters } from "@/lib/specialists";
import { titleCase } from "@/lib/text";

function formatPhone(p?: string): string | undefined {
  const d = p?.replace(/\D/g, "");
  return d && d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

function FilterForm({ drug, condition, filters }: { drug: string; condition?: string; filters: SpecialistFilters }) {
  const field = "w-full rounded-lg border border-[#cbbd9f] bg-surface px-3 py-2 focus:border-navy";
  return (
    <form method="get" action={`/drug/${encodeURIComponent(drug)}`} className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="tab" value="specialists" />
      {condition && <input type="hidden" name="condition" value={condition} />}
      <div>
        <label htmlFor="sp-state" className="mb-1 block font-semibold">
          State
        </label>
        <select id="sp-state" name="state" required defaultValue={filters.state ?? ""} className={field}>
          <option value="" disabled>
            Choose
          </option>
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
        <input id="sp-city" name="city" defaultValue={filters.city ?? ""} placeholder="e.g. Houston" className={field} />
      </div>
      <div>
        <label htmlFor="sp-specialty" className="mb-1 block font-semibold">
          Specialty <span className="font-normal text-muted">(optional)</span>
        </label>
        <select id="sp-specialty" name="specialty" defaultValue={filters.specialty ?? ""} className={field}>
          <option value="">Any specialty</option>
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

function SpecialistCard({ s, drug, year }: { s: Specialist; drug: string; year?: number }) {
  const p = s.provider;
  const e = s.experience;
  const name = p?.name ?? (e ? titleCase(e.name) : "Unknown");
  const phone = formatPhone(p?.phone);
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">
            {name}
            {p?.credential ? `, ${p.credential}` : ""}
          </h4>
          <p className="text-muted">{p?.specialty ?? e?.type}</p>
        </div>
        {phone && (
          <a
            href={`tel:${p?.phone?.replace(/\D/g, "")}`}
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 font-semibold text-cream hover:bg-navy-hover"
          >
            <Phone aria-hidden className="size-4" /> Call {phone}
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {p && (
          <Badge tone="independent" title="Name, specialty and address verified in the federal NPI Registry">
            <BadgeCheck aria-hidden className="size-3.5" /> NPI verified
          </Badge>
        )}
        {e && (
          <Badge tone="ai">
            Prescribed {drug} {e.claims.toLocaleString("en-US")} times
            {e.patients ? ` to ${e.patients.toLocaleString("en-US")} patients` : " (fewer than 11 patients)"}
          </Badge>
        )}
      </div>
      {e && (
        <p className="mt-2 text-[0.95rem] text-muted">
          Experience: Medicare Part D prescriptions{e.brands.length ? ` (${e.brands.slice(0, 3).join(", ")})` : ""} in {year ?? "the latest year"}.
          Medicare patients only, so total experience is likely higher.
        </p>
      )}
      {p?.address && (
        <p className="mt-2 flex items-start gap-1.5">
          <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
          <span>
            {p.address}, {p.city}
          </span>
        </p>
      )}
      <p className="mt-2 text-sm">
        NPI {p?.npi ?? e?.npi}
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

export async function SpecialistsTab({ drug, condition, filters }: { drug: string; condition?: string; filters: SpecialistFilters }) {
  const b = await getSpecialists(drug, filters);
  const where = [b.filters.city, b.filters.state].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Specialists for second opinions</h2>
        <p className="text-muted">
          Clinicians with real experience prescribing {b.drug}, from Medicare prescribing records, with contact details verified in
          the NPI Registry. Contact them directly; Vynthera does not pass messages.
        </p>
      </div>
      <Card>
        <FilterForm drug={drug} condition={condition} filters={b.filters} />
      </Card>
      <SourceProblems problems={b.problems} />

      {b.mode === "needs-state" && <p className="text-muted">Choose a state to see specialists.</p>}

      {b.mode !== "needs-state" && (
        <>
          <p className="font-semibold">
            {b.mode === "prescribers"
              ? `${b.totalPrescribers.toLocaleString("en-US")} clinicians${b.filters.specialty ? ` in ${b.filters.specialty}` : ""} in ${where} prescribed ${b.drug} to Medicare patients${b.dataYear ? ` in ${b.dataYear}` : ""}. Most experienced first.`
              : `Clinicians${b.filters.specialty ? ` in ${b.filters.specialty}` : ""} in ${where}. Prescribing data for ${b.drug} is not available, so experience with it is not shown.`}
          </p>
          {b.specialists.length === 0 ? (
            <Card>
              <p>
                No clinicians found. Try removing the city or specialty filter.
                {b.mode === "prescribers" && " Drugs given in clinics, or rarely prescribed in Medicare, may have no prescribing records."}
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {b.specialists.map((s) => (
                <li key={s.provider?.npi ?? s.experience?.npi}>
                  <SpecialistCard s={s} drug={b.drug} year={b.dataYear} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-sm text-muted">
        Self-reported experience from physicians will be added with physician accounts. Prescribing counts come from CMS
        &ldquo;Medicare Part D Prescribers by Provider and Drug&rdquo;; CMS hides counts under 11 to protect privacy.
      </p>
    </div>
  );
}
