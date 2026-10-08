import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data/properties";
import { serverEnv } from "@/lib/env";
import { AppError, fromDbError } from "@/lib/errors";
import { json, parseJson, route } from "@/lib/api";
import { ALLOWED_TYPES, isAllowedMime } from "@/lib/documents/validate";
import { BUCKET } from "@/lib/pipeline/extraction";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().max(120),
});

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Stap 1 van een upload: controleert rechten, type, grootte en aantal, en geeft
 * een kortlevende signed upload-URL voor een vooraf bepaald pad. Het bestand
 * gaat rechtstreeks naar de private bucket (geen 4,5 MB-limiet van Vercel).
 */
export const POST = route<RouteContext<"/api/woningen/[id]/documenten/upload-url">>(async (req, { params }) => {
  const session = await requireSession("documents.upload");
  const { id } = await params;
  const property = await getProperty(id);
  const body = await parseJson(req, bodySchema, 5_000);
  const env = serverEnv();
  if (!isAllowedMime(body.mimeType)) throw new AppError("bestand_ongeldig", "Dit bestandstype wordt niet ondersteund. Gebruik PDF, DOCX, TXT, JPG, PNG of WEBP.");
  const maxBytes = body.mimeType.startsWith("image/") ? IMAGE_MAX_BYTES : env.UPLOAD_MAX_FILE_MB * 1024 * 1024;
  if (body.size > maxBytes) {
    throw new AppError("bestand_ongeldig", `Het bestand is te groot (maximaal ${Math.round(maxBytes / 1024 / 1024)} MB${body.mimeType.startsWith("image/") ? " voor afbeeldingen" : ""}).`);
  }
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("property_documents")
    .select("id", { count: "exact", head: true })
    .eq("property_id", property.id);
  if (countError) throw fromDbError(countError);
  if ((count ?? 0) >= env.UPLOAD_MAX_FILES_PER_PROPERTY) {
    throw new AppError("limiet_bereikt", `Maximaal ${env.UPLOAD_MAX_FILES_PER_PROPERTY} documenten per woning.`);
  }
  const path = `${session.organizationId}/${property.id}/${randomUUID()}.${ALLOWED_TYPES[body.mimeType].ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new AppError("geen_toegang", "Uploaden is niet toegestaan.");
  return json({ path: data.path, token: data.token });
});
