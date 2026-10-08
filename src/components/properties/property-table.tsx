import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, FileText, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { TextStatusBadge } from "./text-status";
import { LISTING_STATUS_LABELS } from "@/lib/domain/labels";
import { propertyLabel } from "@/lib/domain/property-mapping";
import { relativeTime } from "@/lib/format";
import type { PropertyOverviewRow } from "@/lib/db-types";
import type { ListFilters } from "@/lib/data/properties";

type SortKey = ListFilters["sort"];

function sortHref(basePath: string, filters: ListFilters, key: SortKey) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && k !== "sort" && k !== "dir" && k !== "page") params.set(k, String(v));
  }
  const dir = filters.sort === key && filters.dir === "asc" ? "desc" : "asc";
  params.set("sort", key);
  params.set("dir", dir);
  return `${basePath}?${params.toString()}`;
}

function SortHead({ label, k, filters, basePath, className }: { label: string; k: SortKey; filters: ListFilters; basePath: string; className?: string }) {
  const active = filters.sort === k;
  const Icon = !active ? ArrowUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={sortHref(basePath, filters, k)} scroll={false} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon className="size-3.5 opacity-60" aria-hidden />
      </Link>
    </TableHead>
  );
}

export function PropertyTable({
  rows,
  filters,
  basePath,
  canEdit,
}: {
  rows: PropertyOverviewRow[];
  filters: ListFilters;
  basePath: string;
  canEdit: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
        <p className="text-sm font-medium">Geen woningen gevonden</p>
        <p className="mt-1 text-sm text-muted-foreground">Pas de filters aan of voeg een nieuwe woning toe.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <SortHead label="Adres" k="address" filters={filters} basePath={basePath} className="pl-4" />
            <SortHead label="Plaats / wijk" k="city" filters={filters} basePath={basePath} className="hidden md:table-cell" />
            <SortHead label="Woningtype" k="property_type" filters={filters} basePath={basePath} className="hidden xl:table-cell" />
            <SortHead label="Verkoop" k="listing_status" filters={filters} basePath={basePath} className="hidden lg:table-cell" />
            <SortHead label="Teksten" k="workflow_status" filters={filters} basePath={basePath} />
            <SortHead label="Laatste wijziging" k="updated_at" filters={filters} basePath={basePath} className="hidden md:table-cell" />
            <TableHead className="hidden lg:table-cell">Verantwoordelijke</TableHead>
            <TableHead className="w-24 pr-4 text-right">
              <span className="sr-only">Acties</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="group relative">
              <TableCell className="pl-4 font-medium">
                <Link href={`/woningen/${row.id}`} className="after:absolute after:inset-0 hover:text-primary">
                  {propertyLabel({ ...row, city: null })}
                </Link>
                {row.open_issue_count > 0 ? (
                  <span className="ml-2 align-middle">
                    <StatusBadge tone="warning">{row.open_issue_count} controlepunt{row.open_issue_count === 1 ? "" : "en"}</StatusBadge>
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {[row.city, row.neighbourhood].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="hidden text-muted-foreground xl:table-cell">{row.property_type ?? "—"}</TableCell>
              <TableCell className="hidden lg:table-cell">
                <span className="text-sm">{LISTING_STATUS_LABELS[row.listing_status]}</span>
              </TableCell>
              <TableCell>
                <TextStatusBadge {...row} />
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{relativeTime(row.last_activity_at)}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{row.assigned_to_name || "—"}</TableCell>
              <TableCell className="pr-4 text-right">
                <div className="relative z-10 flex justify-end gap-1">
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Teksten openen">
                    <Link href={`/woningen/${row.id}/teksten`}>
                      <FileText />
                    </Link>
                  </Button>
                  {canEdit ? (
                    <Button asChild variant="ghost" size="icon-sm" aria-label="Gegevens bewerken">
                      <Link href={`/woningen/${row.id}/gegevens`}>
                        <Pencil />
                      </Link>
                    </Button>
                  ) : (
                    <ChevronRight className="size-4 self-center text-muted-foreground" aria-hidden />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Pagination({ total, filters, basePath, pageSize }: { total: number; filters: ListFilters; basePath: string; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v !== undefined && k !== "page") params.set(k, String(v));
    params.set("page", String(page));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Pagina {filters.page} van {pages} · {total} woningen
      </span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" aria-disabled={filters.page <= 1} className={filters.page <= 1 ? "pointer-events-none opacity-50" : ""}>
          <Link href={href(filters.page - 1)}>Vorige</Link>
        </Button>
        <Button asChild variant="outline" size="sm" aria-disabled={filters.page >= pages} className={filters.page >= pages ? "pointer-events-none opacity-50" : ""}>
          <Link href={href(filters.page + 1)}>Volgende</Link>
        </Button>
      </div>
    </div>
  );
}
