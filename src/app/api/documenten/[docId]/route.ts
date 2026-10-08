import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppError, fromDbError } from "@/lib/errors";
import { json, route } from "@/lib/api";
import { BUCKET } from "@/lib/pipeline/extraction";

/** Verwijdert een document: eerst het opslagobject, daarna de registratie (feiten uit dit document vervallen mee). */
export const DELETE = route<RouteContext<"/api/documenten/[docId]">>(async (_req, { params }) => {
  await requireSession("documents.upload");
  const { docId } = await params;
  if (!z.uuid().safeParse(docId).success) throw new AppError("niet_gevonden", "Document niet gevonden.");
  const supabase = await createClient();
  const { data: doc, error } = await supabase.from("property_documents").select("id, storage_path").eq("id", docId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!doc) throw new AppError("niet_gevonden", "Document niet gevonden.");
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (storageError) throw new AppError("geen_toegang", "Het bestand kon niet worden verwijderd.");
  const { error: deleteError, count } = await supabase.from("property_documents").delete({ count: "exact" }).eq("id", docId);
  if (deleteError) throw fromDbError(deleteError);
  if (!count) throw new AppError("geen_toegang", "U heeft geen rechten om dit document te verwijderen.");
  return json({ ok: true });
});
