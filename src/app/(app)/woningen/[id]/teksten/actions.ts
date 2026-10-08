"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { AppError, fromDbError, runAction, type ActionResult } from "@/lib/errors";
import { normalizeHashtags, sanitizeContentHtml, slugify } from "@/lib/content/html";
import type { ContentVersionRow } from "@/lib/db-types";

const saveSchema = z.object({
  propertyId: z.uuid(),
  channel: z.enum(["funda", "website", "facebook", "instagram"]),
  language: z.enum(["nl", "en"]),
  html: z.string().max(60000),
  expectedVersion: z.number().int().min(0),
  basedOnVersionId: z.uuid().nullable(),
  seoTitle: z.string().max(120).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  slug: z.string().max(120).nullable().optional(),
  hashtags: z.array(z.string().max(60)).max(15),
});

/** Slaat een handmatige bewerking op als nieuwe versie. Faalt bij een tussentijdse wijziging door een ander. */
export async function saveTextVersion(input: z.input<typeof saveSchema>): Promise<ActionResult<ContentVersionRow>> {
  return runAction(async () => {
    await requireSession("texts.edit");
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", parsed.error.issues[0]?.message ?? "Ongeldige invoer.");
    const d = parsed.data;
    const html = sanitizeContentHtml(d.html);
    if (!html.replace(/<[^>]+>/g, "").trim()) throw new AppError("ongeldige_invoer", "Een tekst kan niet leeg worden opgeslagen.");
    const isWebsite = d.channel === "website";
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_content_version", {
      p_property_id: d.propertyId,
      p_channel: d.channel,
      p_language: d.language,
      p_content: html,
      p_source: "handmatig",
      p_expected_version: d.expectedVersion,
      p_based_on_version_id: d.basedOnVersionId,
      p_seo_title: isWebsite ? d.seoTitle?.trim() || null : null,
      p_meta_description: isWebsite ? d.metaDescription?.trim() || null : null,
      p_slug: isWebsite && d.slug ? slugify(d.slug) || null : null,
      p_hashtags: normalizeHashtags(d.hashtags),
    });
    if (error) throw fromDbError(error);
    revalidatePath(`/woningen/${d.propertyId}`, "layout");
    return data as ContentVersionRow;
  });
}

/** Herstelt een eerdere versie door die als nieuwe versie op te slaan (geschiedenis blijft intact). */
export async function restoreVersion(input: { versionId: string; expectedVersion: number }): Promise<ActionResult<ContentVersionRow>> {
  return runAction(async () => {
    await requireSession("texts.edit");
    const parsed = z.object({ versionId: z.uuid(), expectedVersion: z.number().int().min(0) }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    const supabase = await createClient();
    const { data: old, error } = await supabase.from("content_versions").select("*").eq("id", parsed.data.versionId).maybeSingle();
    if (error) throw fromDbError(error);
    if (!old) throw new AppError("niet_gevonden", "Versie niet gevonden.");
    const v = old as ContentVersionRow;
    const { data, error: saveError } = await supabase.rpc("save_content_version", {
      p_property_id: v.property_id,
      p_channel: v.channel,
      p_language: v.language,
      p_content: v.content,
      p_source: "hersteld",
      p_expected_version: parsed.data.expectedVersion,
      p_based_on_version_id: v.id,
      p_seo_title: v.seo_title,
      p_meta_description: v.meta_description,
      p_slug: v.slug,
      p_hashtags: v.hashtags,
      p_style_guide_id: v.style_guide_id,
      p_prompt_version: v.prompt_version,
    });
    if (saveError) throw fromDbError(saveError);
    revalidatePath(`/woningen/${v.property_id}`, "layout");
    return data as ContentVersionRow;
  });
}

/** Indienen, goedkeuren of terugzetten naar concept. Rechten worden in de database afgedwongen. */
export async function setTextStatus(input: { versionId: string; status: "concept" | "ter_controle" | "goedgekeurd" }): Promise<ActionResult<ContentVersionRow>> {
  return runAction(async () => {
    const parsed = z.object({ versionId: z.uuid(), status: z.enum(["concept", "ter_controle", "goedgekeurd"]) }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    await requireSession(parsed.data.status === "goedgekeurd" ? "texts.approve" : "texts.submit");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_content_status", { p_version_id: parsed.data.versionId, p_status: parsed.data.status });
    if (error) throw fromDbError(error);
    const row = data as ContentVersionRow;
    revalidatePath(`/woningen/${row.property_id}`, "layout");
    revalidatePath("/dashboard");
    return row;
  });
}

export async function resolveIssue(input: { issueId: string; status: "open" | "opgelost" | "genegeerd" }): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession();
    const parsed = z.object({ issueId: z.uuid(), status: z.enum(["open", "opgelost", "genegeerd"]) }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("review_issues")
      .update({ resolution_status: parsed.data.status })
      .eq("id", parsed.data.issueId)
      .select("property_id")
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("niet_gevonden", "Controlepunt niet gevonden.");
    revalidatePath(`/woningen/${data.property_id}`, "layout");
    return undefined;
  });
}

/** Registreert kopiëren in het auditlog (wie heeft welke tekst gepubliceerd/gekopieerd). */
export async function logCopy(input: { versionId: string; what: "tekst" | "hashtags" | "seo" }): Promise<void> {
  const parsed = z.object({ versionId: z.uuid(), what: z.enum(["tekst", "hashtags", "seo"]) }).safeParse(input);
  if (!parsed.success) return;
  const session = await requireSession().catch(() => null);
  if (!session) return;
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "gekopieerd", p_entity_type: "content_version", p_entity_id: parsed.data.versionId, p_metadata: { onderdeel: parsed.data.what } });
}
