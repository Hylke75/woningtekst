import { createHash } from "node:crypto";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data/properties";
import { serverEnv } from "@/lib/env";
import { AppError, fromDbError } from "@/lib/errors";
import { json, parseJson, route } from "@/lib/api";
import { detectContent, isAllowedMime, sanitizeFilename } from "@/lib/documents/validate";
import { BUCKET } from "@/lib/pipeline/extraction";
import type { DocumentRow } from "@/lib/db-types";

const DOCUMENT_TYPES = ["originele_omschrijving", "verkoopdossier", "meetrapport", "plattegrond", "foto", "energielabel", "vve_document", "overig"] as const;

const bodySchema = z.object({
  path: z.string().max(600),
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(120),
  documentType: z.enum(DOCUMENT_TYPES),
});

/**
 * Stap 2 van een upload: controleert de WERKELIJKE inhoud van het geüploade
 * object (magic bytes, grootte), berekent een hash en registreert het document.
 * Ongeldige bestanden worden direct uit de opslag verwijderd.
 */
export const POST = route<RouteContext<"/api/woningen/[id]/documenten">>(async (req, { params }) => {
  const session = await requireSession("documents.upload");
  const { id } = await params;
  const property = await getProperty(id);
  const body = await parseJson(req, bodySchema, 5_000);
  const expectedPrefix = `${session.organizationId}/${property.id}/`;
  if (!body.path.startsWith(expectedPrefix) || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx|txt|jpg|png|webp)$/.test(body.path)) {
    throw new AppError("geen_toegang", "Ongeldig bestandspad.");
  }
  if (!isAllowedMime(body.mimeType)) throw new AppError("bestand_ongeldig", "Dit bestandstype wordt niet ondersteund.");

  const supabase = await createClient();
  const remove = () => supabase.storage.from(BUCKET).remove([body.path]);
  const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(body.path);
  if (downloadError || !blob) throw new AppError("niet_gevonden", "Het geüploade bestand is niet gevonden. Probeer opnieuw te uploaden.");

  const buffer = new Uint8Array(await blob.arrayBuffer());
  const env = serverEnv();
  if (buffer.byteLength > env.UPLOAD_MAX_FILE_MB * 1024 * 1024) {
    await remove();
    throw new AppError("bestand_ongeldig", `Het bestand is groter dan ${env.UPLOAD_MAX_FILE_MB} MB.`);
  }
  const check = await detectContent(buffer, body.mimeType);
  if (!check.ok) {
    await remove();
    throw new AppError("bestand_ongeldig", check.reason);
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const { data, error } = await supabase
    .from("property_documents")
    .insert({
      property_id: property.id,
      organization_id: session.organizationId,
      storage_path: body.path,
      filename: sanitizeFilename(body.filename),
      mime_type: check.mime,
      file_size: buffer.byteLength,
      document_type: body.documentType,
      sha256,
      extraction_status: body.documentType === "foto" ? "niet_van_toepassing" : "niet_gestart",
    })
    .select("*")
    .single();
  if (error) {
    await remove();
    if (error.code === "23505") throw new AppError("conflict", "Dit bestand is al eerder aan deze woning toegevoegd.");
    throw fromDbError(error);
  }
  return json({ document: data as DocumentRow }, 201);
});
