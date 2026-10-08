import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageSession } from "@/lib/auth/session";
import { getProperty } from "@/lib/data/properties";
import { AppError } from "@/lib/errors";
import { propertyLabel } from "@/lib/domain/property-mapping";
import { LISTING_STATUS_LABELS } from "@/lib/domain/labels";
import { WorkflowBadge } from "@/components/properties/text-status";
import { StatusBadge } from "@/components/common/status-badge";
import { PropertyTabs } from "@/components/properties/property-tabs";

export default async function PropertyLayout({ children, params }: LayoutProps<"/woningen/[id]">) {
  await requirePageSession();
  const { id } = await params;
  const property = await getProperty(id).catch((e) => {
    if (e instanceof AppError && e.code === "niet_gevonden") notFound();
    throw e;
  });
  return (
    <>
      <div className="mb-5">
        <Link href="/woningen" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Woningen
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{propertyLabel(property)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[property.property_type, property.neighbourhood, property.postcode].filter(Boolean).join(" · ") || "Nog niet alle basisgegevens ingevuld"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {property.deleted_at ? <StatusBadge tone="danger">Gearchiveerd</StatusBadge> : null}
            <StatusBadge>{LISTING_STATUS_LABELS[property.listing_status]}</StatusBadge>
            <WorkflowBadge status={property.workflow_status} />
          </div>
        </div>
      </div>
      <PropertyTabs id={property.id} />
      <div className="mt-6">{children}</div>
    </>
  );
}
