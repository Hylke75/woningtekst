"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { AppError, fromDbError, runAction, type ActionResult } from "@/lib/errors";
import { defaultStyleGuideMarkdown } from "@/lib/data/content";
import { callClaude } from "@/lib/ai/call";
import { STYLE_GUIDE_ANALYSIS_SYSTEM } from "@/lib/ai/prompts";
import { styleGuideAnalysisSchema } from "@/lib/ai/schemas";
import { maskPersonalData } from "@/lib/ai/pii";
import { aiConfigured } from "@/lib/env";
import { detectContent, isAllowedMime } from "@/lib/documents/validate";
import { extractSource } from "@/lib/documents/extract-text";
import { createOrGetJob, claimJob, failJob, hashInput, updateJob } from "@/lib/pipeline/jobs";
import type { StyleGuideRow } from "@/lib/db-types";

const publishSchema = z.object({
  title: z.string().trim().min(2).max(200),
  content: z.string().min(50, "De schrijfwijzer is te kort.").max(200000),
  changeNote: z.string().trim().min(3, "Beschrijf kort wat er is gewijzigd.").max(2000),
});

export async function publishStyleGuide(input: z.input<typeof publishSchema>): Promise<ActionResult<StyleGuideRow>> {
  return runAction(async () => {
    await requireSession("styleguide.edit");
    const parsed = publishSchema.safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", parsed.error.issues[0]?.message ?? "Ongeldige invoer.");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("publish_style_guide", {
      p_title: parsed.data.title,
      p_content: parsed.data.content,
      p_change_note: parsed.data.changeNote,
      p_activate: true,
    });
    if (error) throw fromDbError(error);
    revalidatePath("/schrijfwijzer");
    return data as StyleGuideRow;
  });
}

export async function activateDefaultStyleGuide(): Promise<ActionResult<StyleGuideRow>> {
  return runAction(async () => {
    await requireSession("styleguide.edit");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("publish_style_guide", {
      p_title: "Schrijfwijzer Korff de Gidts",
      p_content: await defaultStyleGuideMarkdown(),
      p_change_note: "Initiële versie uit de repository (content/schrijfwijzer/v1.md).",
      p_activate: true,
    });
    if (error) throw fromDbError(error);
    revalidatePath("/schrijfwijzer");
    return data as StyleGuideRow;
  });
}

export async function activateStyleGuide(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("styleguide.edit");
    if (!z.uuid().safeParse(id).success) throw new AppError("niet_gevonden", "Versie niet gevonden.");
    const supabase = await createClient();
    const { error } = await supabase.rpc("activate_style_guide", { p_id: id });
    if (error) throw fromDbError(error);
    revalidatePath("/schrijfwijzer");
    return undefined;
  });
}

const MAX_EXAMPLES_BYTES = 4 * 1024 * 1024;

/**
 * Analyseert het voorbeelddocument (bijv. Korff-de-Gidts-woningomschrijvingen.docx)
 * en levert een VOORSTEL voor een nieuwe schrijfwijzerversie. Er wordt niets
 * automatisch gepubliceerd; de administrator beoordeelt en bewerkt eerst.
 * Het bestand wordt alleen in het geheugen verwerkt en niet opgeslagen.
 */
export async function analyseExamples(formData: FormData): Promise<ActionResult<{ analyse: string; voorstel: string }>> {
  return runAction(async () => {
    const session = await requireSession("styleguide.edit");
    if (!aiConfigured()) throw new AppError("ai_niet_geconfigureerd", "Claude is nog niet gekoppeld.");
    const file = formData.get("bestand");
    const pasted = String(formData.get("tekst") ?? "");
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) throw new AppError("ongeldige_invoer", "Ongeldig verzoek.");
    let text = pasted;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_EXAMPLES_BYTES) throw new AppError("bestand_ongeldig", "Het bestand is groter dan 4 MB. Splits het document of plak de tekst.");
      if (!isAllowedMime(file.type) || file.type.startsWith("image/")) throw new AppError("bestand_ongeldig", "Gebruik een DOCX-, PDF- of TXT-bestand.");
      const buffer = new Uint8Array(await file.arrayBuffer());
      const check = await detectContent(buffer, file.type);
      if (!check.ok) throw new AppError("bestand_ongeldig", check.reason);
      const extracted = await extractSource(buffer, check.mime);
      if (extracted.kind !== "text") throw new AppError("bestand_ongeldig", "Het bestand bevat geen tekst.");
      if (extracted.truncated) throw new AppError("bestand_ongeldig", "Het document is te lang om in één keer te analyseren. Splits het in twee delen.");
      text = extracted.text;
    }
    if (text.trim().length < 500) throw new AppError("ongeldige_invoer", "Upload het voorbeelddocument of plak minimaal enkele voorbeeldteksten.");
    const supabase = await createClient();
    const { data: current } = await supabase.from("style_guides").select("content").eq("is_active", true).maybeSingle();
    const { job, created } = await createOrGetJob(supabase, {
      organizationId: session.organizationId,
      userId: session.userId,
      propertyId: null,
      jobType: "schrijfwijzer_analyse",
      idempotencyKey,
      params: { length: text.length },
      inputHash: hashInput(text),
    });
    if (!created && job.status === "voltooid") {
      const r = job.steps.result as { analyse: string; voorstel: string };
      return r;
    }
    const claimed = await claimJob(supabase, job.id);
    if (!claimed) throw new AppError("conflict", "Deze analyse loopt al.");
    try {
      const masked = maskPersonalData(text).text;
      const r = await callClaude({
        supabase,
        operation: "schrijfwijzer_analyse",
        schema: styleGuideAnalysisSchema,
        system: STYLE_GUIDE_ANALYSIS_SYSTEM,
        content: [
          {
            type: "text",
            text: `<huidige_schrijfwijzer>\n${current?.content ?? (await defaultStyleGuideMarkdown())}\n</huidige_schrijfwijzer>\n\n<voorbeelden>\n${masked}\n</voorbeelden>\n\nAnalyseer de voorbeelden en stel een verbeterde schrijfwijzer op.`,
          },
        ],
        jobId: job.id,
        maxTokens: 32000,
        effort: "high",
      });
      const result = { analyse: r.data.analyse, voorstel: r.data.voorstel_markdown };
      await updateJob(supabase, job.id, { status: "voltooid", currentStep: "voltooid", steps: { result } });
      return result;
    } catch (err) {
      await failJob(supabase, job.id, err);
      throw err;
    }
  });
}
