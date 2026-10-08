import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { AppError, fromDbError } from "@/lib/errors";
import { route } from "@/lib/api";
import { BUCKET } from "@/lib/pipeline/extraction";

/** Geeft een kortlevende signed URL na autorisatiecontrole; nooit een publieke link. */
export const GET = route<RouteContext<"/api/documenten/[docId]/download">>(async (_req, { params }) => {
  const session = await requireSession();
  const { docId } = await params;
  if (!z.uuid().safeParse(docId).success) throw new AppError("niet_gevonden", "Document niet gevonden.");
  const supabase = await createClient();
  const { data: doc, error } = await supabase.from("property_documents").select("id, storage_path, filename, property_id").eq("id", docId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!doc) throw new AppError("niet_gevonden", "Document niet gevonden.");
  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, serverEnv().SIGNED_URL_TTL_SECONDS, { download: doc.filename });
  if (signError || !data) throw new AppError("geen_toegang", "Het document kon niet worden geopend.");
  await supabase.rpc("log_event", { p_action: "document_geopend", p_entity_type: "property_document", p_entity_id: doc.id, p_metadata: { door: session.userId } });
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
});
