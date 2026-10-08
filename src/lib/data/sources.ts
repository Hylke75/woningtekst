import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { DocumentRow, FactRow, ReviewIssueRow } from "@/lib/db-types";

export async function listDocuments(propertyId: string): Promise<DocumentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("property_documents").select("*").eq("property_id", propertyId).order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return (data ?? []) as DocumentRow[];
}

export async function listFacts(propertyId: string): Promise<FactRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("property_facts").select("*").eq("property_id", propertyId).order("created_at");
  if (error) throw fromDbError(error);
  return (data ?? []) as FactRow[];
}

export async function listIssues(propertyId: string, opts: { onlyOpen?: boolean } = {}): Promise<ReviewIssueRow[]> {
  const supabase = await createClient();
  let q = supabase.from("review_issues").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(300);
  if (opts.onlyOpen) q = q.eq("resolution_status", "open");
  const { data, error } = await q;
  if (error) throw fromDbError(error);
  return (data ?? []) as ReviewIssueRow[];
}
