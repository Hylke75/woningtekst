import "server-only";
import { AppError, fromDbError } from "@/lib/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import { STANDARD_STYLE, type StyleChoice, type WritingStyleRow } from "@/lib/content/writing-styles";

/** Schrijfstijlen van de eigen organisatie (RLS), op volgorde. */
export async function listWritingStyles(supabase: ServerSupabase, opts: { includeInactive?: boolean } = {}): Promise<WritingStyleRow[]> {
  let q = supabase.from("writing_styles").select("*").order("sort_order").order("name");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw fromDbError(error);
  return (data ?? []) as WritingStyleRow[];
}

/** Zet een keuze om naar een stijl; null = standaardstijl. Onbekend of inactief = fout. */
export async function resolveWritingStyle(supabase: ServerSupabase, choice: StyleChoice | null | undefined): Promise<WritingStyleRow | null> {
  if (!choice || choice === STANDARD_STYLE) return null;
  const { data, error } = await supabase.from("writing_styles").select("*").eq("id", choice).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data || !(data as WritingStyleRow).is_active) throw new AppError("ongeldige_invoer", "Deze schrijfstijl bestaat niet (meer) of is uitgeschakeld.");
  return data as WritingStyleRow;
}
