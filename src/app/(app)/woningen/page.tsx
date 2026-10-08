import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requirePageSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listFilterSchema, listProperties, PAGE_SIZE } from "@/lib/data/properties";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { PropertyFilters } from "@/components/properties/property-filters";
import { Pagination, PropertyTable } from "@/components/properties/property-table";
import { FlashMessage } from "@/components/common/flash-message";

export const metadata: Metadata = { title: "Woningen" };

export default async function PropertiesPage({ searchParams }: PageProps<"/woningen">) {
  const session = await requirePageSession();
  const filters = listFilterSchema.parse(await searchParams);
  const list = await listProperties(filters, session.userId);
  return (
    <>
      <Suspense>
        <FlashMessage />
      </Suspense>
      <PageHeader
        title="Woningen"
        description={`${list.total} ${list.total === 1 ? "woning" : "woningen"}${filters.archived ? " in het archief" : ""}`}
        actions={
          can(session.role, "properties.create") ? (
            <Button asChild size="lg">
              <Link href="/woningen/nieuw">
                <Plus /> Nieuwe woning
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4">
        <Suspense>
          <PropertyFilters showArchived={can(session.role, "properties.archive")} />
        </Suspense>
      </div>
      <PropertyTable rows={list.rows} filters={filters} basePath="/woningen" canEdit={can(session.role, "properties.edit")} />
      <Pagination total={list.total} filters={filters} basePath="/woningen" pageSize={PAGE_SIZE} />
    </>
  );
}
