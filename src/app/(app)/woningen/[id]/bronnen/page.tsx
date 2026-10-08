import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getProperty } from "@/lib/data/properties";
import { listDocuments, listFacts, listIssues } from "@/lib/data/sources";
import { groupFacts } from "@/lib/domain/facts";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { FactsReview } from "@/components/sources/facts-review";
import { PastePanel } from "@/components/sources/paste-panel";
import { IssuesList } from "@/components/sources/issues-list";

export const metadata: Metadata = { title: "Bronnen en controle" };

export default async function SourcesPage({ params }: PageProps<"/woningen/[id]/bronnen">) {
  const session = await requirePageSession();
  const { id } = await params;
  const [property, documents, facts, issues] = await Promise.all([getProperty(id), listDocuments(id), listFacts(id), listIssues(id)]);
  const canVerify = can(session.role, "facts.verify") && !property.deleted_at;
  const extractionIssues = issues.filter((i) => i.category === "extractie");
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_400px]">
      <section aria-labelledby="broncontrole" className="min-w-0 space-y-4">
        <div>
          <h2 id="broncontrole" className="text-base font-semibold">
            Broncontrole
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Per gegeven ziet u de bron, het citaat en de betrouwbaarheid. Bij tegenstrijdige bronnen bepaalt u zelf welke waarde juist is; de applicatie kiest nooit zelf.
          </p>
        </div>
        <FactsReview
          propertyId={property.id}
          reviews={groupFacts(facts, property)}
          documentNames={Object.fromEntries(documents.map((d) => [d.id, d.filename]))}
          canVerify={canVerify}
        />
        {extractionIssues.length ? (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold">Opmerkingen bij de analyse</h3>
            <IssuesList issues={extractionIssues} />
          </div>
        ) : null}
      </section>
      <aside className="space-y-8">
        <section aria-labelledby="documenten" className="space-y-3">
          <h2 id="documenten" className="text-base font-semibold">
            Gekoppelde documenten ({documents.length})
          </h2>
          <DocumentsPanel propertyId={property.id} documents={documents} canUpload={can(session.role, "documents.upload") && !property.deleted_at} canAnalyse={canVerify} compact />
        </section>
        {canVerify ? (
          <section aria-labelledby="plakken" className="space-y-3">
            <h2 id="plakken" className="text-base font-semibold">
              Tekst plakken
            </h2>
            <PastePanel propertyId={property.id} />
          </section>
        ) : null}
      </aside>
    </div>
  );
}
