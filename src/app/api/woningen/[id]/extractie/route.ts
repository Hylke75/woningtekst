import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data/properties";
import { idempotencyKeySchema, json, parseJson, route } from "@/lib/api";
import { MAX_PASTED_CHARS, runExtraction } from "@/lib/pipeline/extraction";

export const maxDuration = 300;

const bodySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("document"), documentId: z.uuid() }),
    z.object({ type: z.literal("text"), text: z.string().min(20, "Plak minimaal een paar zinnen tekst.").max(MAX_PASTED_CHARS) }),
  ]),
});

/** Analyseert één bron (document of geplakte tekst) en legt de gevonden feiten vast met bronvermelding. */
export const POST = route<RouteContext<"/api/woningen/[id]/extractie">>(async (req, { params }) => {
  const session = await requireSession("facts.verify");
  const { id } = await params;
  const property = await getProperty(id);
  const body = await parseJson(req, bodySchema, MAX_PASTED_CHARS * 4 + 1000);
  const supabase = await createClient();
  const { summary } = await runExtraction({ supabase, session, property, source: body.source, idempotencyKey: body.idempotencyKey });
  return json({ summary });
});
