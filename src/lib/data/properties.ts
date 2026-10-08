import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AppError, fromDbError } from "@/lib/errors";
import type { PropertyOverviewRow, PropertyRow, WorkflowStatus } from "@/lib/db-types";
import { LISTING_STATUSES } from "@/lib/domain/property-fields";

export const listFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  workflow: z.enum(["concept", "in_controle", "goedgekeurd", "gearchiveerd"]).optional().catch(undefined),
  listing: z.enum(LISTING_STATUSES).optional().catch(undefined),
  type: z.string().trim().max(60).optional().catch(undefined),
  mine: z.enum(["1"]).optional().catch(undefined),
  sort: z.enum(["updated_at", "address", "city", "listing_status", "workflow_status", "property_type"]).default("updated_at").catch("updated_at"),
  dir: z.enum(["asc", "desc"]).default("desc").catch("desc"),
  archived: z.enum(["1"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).default(1).catch(1),
});
export type ListFilters = z.infer<typeof listFilterSchema>;

export const PAGE_SIZE = 25;

function escapeLike(value: string) {
  return value.replace(/[\\%_,()*]/g, (m) => `\\${m}`);
}

export async function listProperties(filters: ListFilters, userId: string, limit = PAGE_SIZE) {
  const supabase = await createClient();
  let query = supabase.from("property_overview").select("*", { count: "exact" });
  if (filters.archived) query = query.not("deleted_at", "is", null);
  else query = query.is("deleted_at", null);
  if (filters.q) {
    const term = `%${escapeLike(filters.q)}%`;
    query = query.or(`address.ilike.${term},city.ilike.${term},neighbourhood.ilike.${term},postcode.ilike.${term},house_number.ilike.${term}`);
  }
  if (filters.workflow) query = query.eq("workflow_status", filters.workflow);
  if (filters.listing) query = query.eq("listing_status", filters.listing);
  if (filters.type) query = query.eq("property_type", filters.type);
  if (filters.mine) query = query.eq("assigned_to", userId);
  const from = (filters.page - 1) * limit;
  query = query.order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false }).order("id").range(from, from + limit - 1);
  const { data, error, count } = await query;
  if (error) throw fromDbError(error);
  return { rows: (data ?? []) as PropertyOverviewRow[], total: count ?? 0 };
}

export async function dashboardStats() {
  const supabase = await createClient();
  const statuses: WorkflowStatus[] = ["concept", "in_controle", "goedgekeurd"];
  const [total, ...byStatus] = await Promise.all([
    supabase.from("properties").select("id", { count: "exact", head: true }).is("deleted_at", null),
    ...statuses.map((s) => supabase.from("properties").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("workflow_status", s)),
  ]);
  const firstError = [total, ...byStatus].find((r) => r.error)?.error;
  if (firstError) throw fromDbError(firstError);
  return {
    total: total.count ?? 0,
    concept: byStatus[0].count ?? 0,
    in_controle: byStatus[1].count ?? 0,
    goedgekeurd: byStatus[2].count ?? 0,
  };
}

export async function recentProperties(limit = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_overview")
    .select("*")
    .is("deleted_at", null)
    .order("last_activity_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDbError(error);
  return (data ?? []) as PropertyOverviewRow[];
}

const uuid = z.uuid();

export async function getProperty(id: string): Promise<PropertyRow> {
  if (!uuid.safeParse(id).success) throw new AppError("niet_gevonden", "Woning niet gevonden.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("niet_gevonden", "Woning niet gevonden.");
  return data as PropertyRow;
}

export async function listColleagues() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("user_id, role, is_active, profiles!inner(full_name, email)")
    .eq("is_active", true);
  if (error) throw fromDbError(error);
  return (data ?? []).map((m) => {
    const p = (m as unknown as { profiles: { full_name: string; email: string } }).profiles;
    return { id: m.user_id as string, role: m.role as string, name: p.full_name || p.email };
  });
}
