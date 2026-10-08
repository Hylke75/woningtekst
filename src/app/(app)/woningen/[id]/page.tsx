import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { requirePageSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProperty, listColleagues } from "@/lib/data/properties";
import { listDocuments, listFacts, listIssues } from "@/lib/data/sources";
import { latestVersions, SLOTS } from "@/lib/data/content";
import { FIELDS } from "@/lib/domain/property-fields";
import { getFieldValue, missingForGeneration } from "@/lib/domain/property-mapping";
import { CHANNEL_LABELS, CONTENT_STATUS_LABELS, LANGUAGE_LABELS, SALE_CONDITION_LABELS } from "@/lib/domain/labels";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { IssuesList } from "@/components/sources/issues-list";
import { DataCheckCard } from "@/components/sources/data-check-card";
import { AssignSelect, PropertyAdminActions } from "@/components/properties/property-admin-actions";

export const metadata: Metadata = { title: "Woning" };

export default async function PropertyOverviewPage({ params }: PageProps<"/woningen/[id]">) {
  const session = await requirePageSession();
  const { id } = await params;
  const supabase = await createClient();
  const [property, documents, facts, issues, colleagues, latest] = await Promise.all([
    getProperty(id),
    listDocuments(id),
    listFacts(id),
    listIssues(id),
    listColleagues(),
    latestVersions(supabase, id),
  ]);
  const filled = FIELDS.filter((f) => {
    const v = getFieldValue(property, f.key);
    return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  const missing = missingForGeneration(property);
  const conflicts = facts.filter((f) => f.verification_status === "conflict").length;
  const unverified = facts.filter((f) => f.verification_status === "onbevestigd" && f.source_type !== "handmatig").length;
  const generalIssues = issues.filter((i) => !i.content_version_id && i.category !== "extractie");
  const canEdit = can(session.role, "properties.edit") && !property.deleted_at;

  const keyFacts = [
    ["Vraagprijs", property.asking_price ? `${formatPrice(property.asking_price)}${property.sale_condition ? ` ${SALE_CONDITION_LABELS[property.sale_condition].toLowerCase()}` : ""}` : "—"],
    ["Woonoppervlakte", property.living_area ? `${formatNumber(property.living_area)} m²` : "—"],
    ["Perceel", property.plot_area ? `${formatNumber(property.plot_area)} m²` : "—"],
    ["Bouwjaar", property.year_built ?? "—"],
    ["Energielabel", property.energy_label ?? "—"],
    ["Kamers / slaapkamers", property.rooms || property.bedrooms ? `${property.rooms ?? "—"} / ${property.bedrooms ?? "—"}` : "—"],
  ];

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <DataCheckCard propertyId={property.id} checkedAt={property.data_checked_at} conflicts={conflicts} unverified={unverified} canEdit={canEdit} />

        <section className="rounded-xl border bg-card" aria-labelledby="kerngegevens">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h2 id="kerngegevens" className="text-sm font-semibold">
              Kerngegevens
            </h2>
            <span className="text-xs text-muted-foreground">
              {filled} van {FIELDS.length} velden ingevuld
            </span>
          </header>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-3">
            {keyFacts.map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-sm font-medium">{String(v)}</dd>
              </div>
            ))}
          </dl>
          {missing.length ? (
            <p className="border-t px-5 py-3 text-sm text-warning">Nodig voor tekstgeneratie: {missing.map((f) => f.label.toLowerCase()).join(", ")}.</p>
          ) : null}
          <div className="flex gap-2 border-t px-5 py-3">
            <Button asChild size="sm" variant="outline">
              <Link href={`/woningen/${property.id}/gegevens`}>Gegevens {canEdit ? "bewerken" : "bekijken"}</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/woningen/${property.id}/bronnen`}>
                Bronnen ({documents.length}) {conflicts ? <StatusBadge tone="warning">{conflicts} conflict</StatusBadge> : null}
              </Link>
            </Button>
          </div>
        </section>

        <section className="rounded-xl border bg-card" aria-labelledby="tekststatus">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h2 id="tekststatus" className="text-sm font-semibold">
              Teksten
            </h2>
            <Button asChild size="sm">
              <Link href={`/woningen/${property.id}/teksten`}>
                Naar de teksten <ArrowRight />
              </Link>
            </Button>
          </header>
          <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
            {SLOTS.map((s) => {
              const v = latest.get(s.key);
              return (
                <li key={s.key} className="flex items-center justify-between gap-2 border-b px-5 py-2.5 sm:odd:border-r">
                  <span className="flex items-center gap-2 text-sm">
                    <FileText className="size-3.5 text-muted-foreground" />
                    {CHANNEL_LABELS[s.channel]} · {LANGUAGE_LABELS[s.language]}
                  </span>
                  {v ? (
                    <StatusBadge tone={v.status === "goedgekeurd" ? "success" : v.status === "ter_controle" ? "warning" : "neutral"}>
                      {CONTENT_STATUS_LABELS[v.status]} · v{v.version_number}
                    </StatusBadge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Nog niet gemaakt</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="controlepunten">
          <h2 id="controlepunten" className="text-sm font-semibold">
            Algemene controlepunten
          </h2>
          <IssuesList issues={generalIssues} />
        </section>
      </div>

      <aside className="space-y-6">
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Verantwoordelijke medewerker</h2>
          <AssignSelect propertyId={property.id} assignedTo={property.assigned_to} colleagues={colleagues} disabled={!canEdit} />
        </section>
        <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
          <h2 className="font-semibold">Dossier</h2>
          <p className="text-muted-foreground">Aangemaakt op {formatDateTime(property.created_at)}</p>
          <p className="text-muted-foreground">Laatst gewijzigd op {formatDateTime(property.updated_at)}</p>
          <p className="text-muted-foreground">
            {documents.length} {documents.length === 1 ? "document" : "documenten"} gekoppeld ·{" "}
            <Link href={`/woningen/${property.id}/bronnen`} className="text-primary hover:underline">
              bekijken
            </Link>
          </p>
          <div className="pt-2">
            <PropertyAdminActions
              propertyId={property.id}
              archived={Boolean(property.deleted_at)}
              canArchive={can(session.role, "properties.archive")}
              canPurge={can(session.role, "properties.purge")}
              documentCount={documents.length}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
