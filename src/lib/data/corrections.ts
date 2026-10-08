import "server-only";
import { htmlToPlainText } from "@/lib/content/html";
import { fromDbError } from "@/lib/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Channel, ContentVersionRow, Language } from "@/lib/db-types";

export type CorrectionPair = { versionId: string; channel: Channel; language: Language; ai: string; approved: string };

/** Maximaal aantal paren en tekens per tekst: houdt de analyse beheersbaar en betaalbaar. */
const MAX_PAIRS = 12;
const MAX_CHARS = 2500;

type Row = Pick<ContentVersionRow, "id" | "property_id" | "channel" | "language" | "version_number" | "content" | "source" | "status" | "created_at">;

/**
 * Paren van (eerste AI-tekst, uiteindelijk goedgekeurde tekst) per woning/kanaal/taal
 * uit de laatste 90 dagen, alleen waar een medewerker de tekst daadwerkelijk heeft aangepast.
 */
export async function collectCorrectionPairs(supabase: ServerSupabase): Promise<CorrectionPair[]> {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("content_versions")
    .select("id, property_id, channel, language, version_number, content, source, status, created_at")
    .gte("created_at", since)
    .order("version_number", { ascending: true })
    .limit(2000);
  if (error) throw fromDbError(error);
  return pairsFromVersions((data ?? []) as Row[]);
}

export function pairsFromVersions(rows: Row[]): CorrectionPair[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.property_id}:${r.channel}:${r.language}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const pairs: (CorrectionPair & { at: string })[] = [];
  for (const versions of groups.values()) {
    const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);
    const approved = [...sorted].reverse().find((v) => v.status === "goedgekeurd");
    if (!approved) continue;
    const ai = [...sorted].reverse().find((v) => v.source === "ai_generatie" && v.version_number <= approved.version_number);
    if (!ai) continue;
    const aiText = htmlToPlainText(ai.content).trim();
    const approvedText = htmlToPlainText(approved.content).trim();
    if (!aiText || aiText === approvedText) continue; // ongewijzigd goedgekeurd: niets te leren
    pairs.push({
      versionId: approved.id,
      channel: approved.channel,
      language: approved.language,
      ai: aiText.slice(0, MAX_CHARS),
      approved: approvedText.slice(0, MAX_CHARS),
      at: approved.created_at,
    });
  }
  return pairs
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_PAIRS)
    .map((p) => ({ versionId: p.versionId, channel: p.channel, language: p.language, ai: p.ai, approved: p.approved }));
}
