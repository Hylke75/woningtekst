import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError, fromDbError } from "@/lib/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Channel, ContentVersionRow, Language, StyleGuideRow } from "@/lib/db-types";

export const CHANNELS: Channel[] = ["funda", "website", "facebook", "instagram"];
export const LANGUAGES: Language[] = ["nl", "en"];
export const SLOTS = CHANNELS.flatMap((c) => LANGUAGES.map((l) => ({ channel: c, language: l, key: `${c}:${l}` as const })));
export type SlotKey = `${Channel}:${Language}`;

export async function getActiveStyleGuide(supabase: ServerSupabase): Promise<StyleGuideRow> {
  const { data, error } = await supabase.from("style_guides").select("*").eq("is_active", true).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("configuratie", "Er is nog geen actieve schrijfwijzer. Een administrator kan deze activeren onder Schrijfwijzer.");
  return data as StyleGuideRow;
}

export async function getStyleGuide(supabase: ServerSupabase, id: string): Promise<StyleGuideRow> {
  const { data, error } = await supabase.from("style_guides").select("*").eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("niet_gevonden", "Schrijfwijzer niet gevonden.");
  return data as StyleGuideRow;
}

export async function defaultStyleGuideMarkdown(): Promise<string> {
  return readFile(path.join(process.cwd(), "content/schrijfwijzer/v1.md"), "utf8");
}

/** Laatste versie per kanaal/taal. */
export async function latestVersions(supabase: ServerSupabase, propertyId: string): Promise<Map<SlotKey, ContentVersionRow>> {
  const { data, error } = await supabase
    .from("content_versions")
    .select("*")
    .eq("property_id", propertyId)
    .order("version_number", { ascending: false });
  if (error) throw fromDbError(error);
  const map = new Map<SlotKey, ContentVersionRow>();
  for (const row of (data ?? []) as ContentVersionRow[]) {
    const key = `${row.channel}:${row.language}` as SlotKey;
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

/**
 * Een tekst is "beschermd" als de laatste versie handmatig is bewerkt, is
 * herschreven of hersteld, of ter controle/goedgekeurd is. Volledige generatie
 * overschrijft beschermde teksten alleen als de medewerker dat expliciet kiest.
 */
export function isProtected(v: ContentVersionRow | undefined): boolean {
  if (!v) return false;
  return v.source !== "ai_generatie" || v.status !== "concept";
}
