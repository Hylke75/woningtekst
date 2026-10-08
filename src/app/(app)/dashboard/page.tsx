import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requirePageSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dashboardStats, listFilterSchema, listProperties, PAGE_SIZE, recentProperties } from "@/lib/data/properties";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { PropertyFilters } from "@/components/properties/property-filters";
import { Pagination, PropertyTable } from "@/components/properties/property-table";
import { TextStatusBadge } from "@/components/properties/text-status";
import { FlashMessage } from "@/components/common/flash-message";
import { propertyLabel } from "@/lib/domain/property-mapping";
import { relativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Insights, type DashboardInsights } from "@/components/dashboard/insights";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requirePageSession();
  const filters = listFilterSchema.parse(await searchParams);
  const supabase = await createClient();
  const [stats, recent, list, insightsRes] = await Promise.all([
    dashboardStats(),
    recentProperties(5),
    listProperties(filters, session.userId),
    supabase.rpc("dashboard_stats", { p_days: 30 }),
  ]);
  // Inzichtcijfers zijn aanvullend: een fout daarin mag het dashboard niet blokkeren.
  const insights = (insightsRes.error ? null : insightsRes.data) as DashboardInsights | null;
  const canCreate = can(session.role, "properties.create");

  const cards = [
    { label: "Totaal woningen", value: stats.total, href: "/dashboard" },
    { label: "Concept", value: stats.concept, href: "/dashboard?workflow=concept" },
    { label: "In controle", value: stats.in_controle, href: "/dashboard?workflow=in_controle" },
    { label: "Goedgekeurd", value: stats.goedgekeurd, href: "/dashboard?workflow=goedgekeurd" },
  ];

  return (
    <>
      <Suspense>
        <FlashMessage />
      </Suspense>
      <PageHeader
        title="Dashboard"
        description={`Welkom${session.fullName ? `, ${session.fullName.split(" ")[0]}` : ""}. Overzicht van alle woningen en teksten.`}
        actions={
          canCreate ? (
            <Button asChild size="lg">
              <Link href="/woningen/nieuw">
                <Plus /> Nieuwe woning
              </Link>
            </Button>
          ) : null
        }
      />

      <section aria-label="Kerncijfers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{c.value}</p>
          </Link>
        ))}
      </section>

      {insights ? <Insights data={insights} isAdmin={session.role === "admin"} /> : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_320px]">
        <section aria-labelledby="overzicht" className="min-w-0">
          <h2 id="overzicht" className="mb-3 text-base font-semibold">
            Alle woningen
          </h2>
          <div className="mb-4">
            <Suspense>
              <PropertyFilters />
            </Suspense>
          </div>
          <PropertyTable rows={list.rows} filters={filters} basePath="/dashboard" canEdit={can(session.role, "properties.edit")} />
          <Pagination total={list.total} filters={filters} basePath="/dashboard" pageSize={PAGE_SIZE} />
        </section>

        <aside aria-labelledby="recent">
          <h2 id="recent" className="mb-3 text-base font-semibold">
            Recent gewijzigd
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {recent.length === 0 ? <li className="p-4 text-sm text-muted-foreground">Nog geen woningen.</li> : null}
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/woningen/${r.id}`} className="block p-4 hover:bg-muted/40">
                  <p className="truncate text-sm font-medium">{propertyLabel(r)}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <TextStatusBadge {...r} />
                    <span className="text-xs text-muted-foreground">{relativeTime(r.last_activity_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
