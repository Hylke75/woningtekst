import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, serverEnv } from "@/lib/env";
import { AppError, fromDbError } from "@/lib/errors";
import { json, route } from "@/lib/api";
import { callClaude } from "@/lib/ai/call";
import { ALT_TEXT_SYSTEM } from "@/lib/ai/prompts";
import { altTextSchema } from "@/lib/ai/schemas";
import { detectContent } from "@/lib/documents/validate";
import { BUCKET } from "@/lib/pipeline/extraction";

export const maxDuration = 120;

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 3_700_000;

/** Maakt Nederlandse en Engelse alt-teksten voor één foto en slaat ze op bij het document. */
export const POST = route<RouteContext<"/api/documenten/[docId]/alt-tekst">>(async (_req, { params }) => {
  await requireSession("documents.upload");
  const { docId } = await params;
  if (!z.uuid().safeParse(docId).success) throw new AppError("niet_gevonden", "Document niet gevonden.");
  if (!aiConfigured()) throw new AppError("ai_niet_geconfigureerd", "Claude is nog niet gekoppeld. Neem contact op met een administrator.");
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("property_documents")
    .select("id, property_id, storage_path, mime_type, file_size")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!doc) throw new AppError("niet_gevonden", "Document niet gevonden.");
  if (!(IMAGE_MIME as readonly string[]).includes(doc.mime_type)) throw new AppError("ongeldige_invoer", "Alt-teksten kunnen alleen voor afbeeldingen worden gemaakt.");
  if (doc.file_size > MAX_BYTES) throw new AppError("bestand_ongeldig", "De afbeelding is te groot voor automatische beschrijving (max. 3,7 MB).");

  const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (dlError || !blob) throw new AppError("geen_toegang", "De afbeelding kon niet worden gelezen.");
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const check = await detectContent(buffer, doc.mime_type);
  if (!check.ok) throw new AppError("bestand_ongeldig", check.reason);

  const r = await callClaude({
    supabase,
    operation: "alt_tekst",
    schema: altTextSchema,
    system: ALT_TEXT_SYSTEM,
    content: [
      { type: "image", mediaType: doc.mime_type as (typeof IMAGE_MIME)[number], base64: Buffer.from(buffer).toString("base64") },
      { type: "text", text: "Schrijf de alt-teksten voor deze foto." },
    ],
    propertyId: doc.property_id,
    maxTokens: 2000,
    effort: "low",
    model: serverEnv().ANTHROPIC_LIGHT_MODEL,
  });
  const { data: saved, error: saveError } = await supabase
    .from("property_documents")
    .update({ alt_text_nl: r.data.nl.trim().slice(0, 300), alt_text_en: r.data.en.trim().slice(0, 300) })
    .eq("id", doc.id)
    .select("id, alt_text_nl, alt_text_en")
    .maybeSingle();
  if (saveError) throw fromDbError(saveError);
  if (!saved) throw new AppError("geen_toegang", "U mag dit document niet bijwerken.");
  return json({ document: saved });
});
