import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getProperty } from "@/lib/data/properties";
import { listDocuments, listFacts } from "@/lib/data/sources";
import { rowToFormValues } from "@/lib/domain/property-mapping";
import { factHints } from "@/lib/domain/facts";
import { PropertyForm } from "@/components/properties/property-form";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { DataCheckCard } from "@/components/sources/data-check-card";

export const metadata: Metadata = { title: "Woninggegevens" };

export default async function PropertyDataPage({ params }: PageProps<"/woningen/[id]/gegevens">) {
  const session = await requirePageSession();
  const { id } = await params;
  const [property, documents, facts] = await Promise.all([getProperty(id), listDocuments(id), listFacts(id)]);
  const canEdit = can(session.role, "properties.edit") && !property.deleted_at;
  const conflicts = facts.filter((f) => f.verification_status === "conflict").length;
  const unverified = facts.filter((f) => f.verification_status === "onbevestigd" && f.source_type !== "handmatig").length;
  return (
    <div className="space-y-6">
      <DataCheckCard propertyId={property.id} checkedAt={property.data_checked_at} conflicts={conflicts} unverified={unverified} canEdit={canEdit} />
      <PropertyForm
        key={property.updated_at}
        propertyId={property.id}
        initialValues={rowToFormValues(property)}
        canEdit={canEdit}
        factHints={factHints(facts)}
        documentsSlot={
          <DocumentsPanel
            propertyId={property.id}
            documents={documents}
            canUpload={can(session.role, "documents.upload") && !property.deleted_at}
            canAnalyse={can(session.role, "facts.verify") && !property.deleted_at}
            compact
          />
        }
      />
    </div>
  );
}
