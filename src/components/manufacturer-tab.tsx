import { Factory } from "lucide-react";
import { ArticleCard } from "./article-card";
import { CopyCitationsButton } from "./copy-citations";
import { ShowMore } from "./show-more";
import { SourceProblems } from "./source-problems";
import { TrialCard } from "./trial-card";
import { Badge, Card, SourceLink } from "./ui";
import { loadManufacturer } from "@/lib/loaders";
import { displayCompany, type Company } from "@/lib/manufacturer";

const TYPE_LABEL = { NDA: "Original brand (NDA)", BLA: "Biologic (BLA)", ANDA: "Generic (ANDA)", OTHER: "Other application" };

function CompanyCard({ company: c }: { company: Company }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="text-lg font-semibold">{c.name}</h4>
        {c.isInnovator && <Badge tone="ai">Brand-name (NDA/BLA) holder</Badge>}
        {c.activeProducts === 0 && <Badge tone="neutral">No products currently marketed</Badge>}
      </div>
      <ul className="space-y-1 text-[0.95rem]">
        {c.applications.slice(0, 4).map((a) => (
          <li key={a.number}>
            <SourceLink href={a.url}>{a.number}</SourceLink> · {TYPE_LABEL[a.type]}
            {a.brandNames.length > 0 && <> · {a.brandNames.slice(0, 3).join(", ")}</>}
            {a.approvedOn && <> · approved {a.approvedOn}</>}
            {a.forms.length > 0 && <span className="text-muted"> · {a.forms.slice(0, 2).join("; ")}</span>}
          </li>
        ))}
        {c.applications.length > 4 && <li className="text-muted">and {c.applications.length - 4} more applications</li>}
      </ul>
    </div>
  );
}

export async function ManufacturerTab({ drug }: { drug: string }) {
  const m = await loadManufacturer(drug);
  const innovators = m.companies.filter((c) => c.isInnovator);
  const generics = m.companies.filter((c) => !c.isInnovator);
  const marketedGenerics = generics.filter((c) => c.activeProducts > 0).length;

  return (
    <div className="space-y-8">
      <SourceProblems problems={m.problems} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Who makes {m.drug}</h2>
          <p className="text-muted">
            From Drugs@FDA. The holder of each FDA application is responsible for the product.
            {m.label && <> The current label lists {displayCompany(m.label.manufacturer)}.</>}
          </p>
        </div>
        <CopyCitationsButton citations={m.publications} label="Copy manufacturer citations" />
      </div>

      <section aria-labelledby="makers-heading" className="space-y-3">
        <h3 id="makers-heading" className="sr-only">
          Manufacturers
        </h3>
        {m.companies.length === 0 ? (
          <Card>
            <p>No FDA applications were found for {m.drug}. It may be sold under a different ingredient name, or not approved in the US.</p>
          </Card>
        ) : (
          <>
            {innovators.map((c) => (
              <CompanyCard key={c.core} company={c} />
            ))}
            {generics.length > 0 && (
              <div>
                <p className="mb-2 font-semibold">
                  <Factory aria-hidden className="mr-1 inline size-4" />
                  {generics.length} generic manufacturer{generics.length === 1 ? "" : "s"}, {marketedGenerics} currently marketing
                </p>
                <ShowMore items={generics.map((c) => <CompanyCard key={c.core} company={c} />)} initial={3} noun="manufacturers" />
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="mfr-trials">
        <h3 id="mfr-trials" className="text-xl font-semibold">
          Trials run by the manufacturer
        </h3>
        <p className="mb-3 text-muted">
          ClinicalTrials.gov studies of {m.drug} led by {m.researchCompanies.join(", ") || "the manufacturer"}. Manufacturer-run
          research is marked Industry-funded.
        </p>
        {m.trials.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface p-4">No trials led by the manufacturer were found.</p>
        ) : (
          <ShowMore items={m.trials.map((t) => <TrialCard key={t.nctId} trial={t} />)} noun="trials" />
        )}
      </section>

      <section aria-labelledby="mfr-pubs">
        <h3 id="mfr-pubs" className="text-xl font-semibold">
          Publications linked to the manufacturer
        </h3>
        <p className="mb-3 text-muted">
          MEDLINE articles on {m.drug} with an author affiliated with, or funding from, {m.researchCompanies.join(", ") || "the manufacturer"}.
        </p>
        {m.publications.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface p-4">No manufacturer-linked publications were found.</p>
        ) : (
          <ShowMore items={m.publications.map((a) => <ArticleCard key={a.id} article={a} manufacturerLinked />)} noun="publications" />
        )}
      </section>
    </div>
  );
}
