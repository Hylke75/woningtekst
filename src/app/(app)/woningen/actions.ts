"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { AppError, fromDbError, runAction, type ActionResult } from "@/lib/errors";
import { propertyPatchSchema } from "@/lib/domain/property-fields";
import { patchToRpcArgs } from "@/lib/domain/property-mapping";
import { recomputeConflicts } from "@/lib/pipeline/extraction";
import { getProperty } from "@/lib/data/properties";

const idSchema = z.uuid();

export async function createProperty(formData: FormData) {
  const session = await requireSession("properties.create");
  const mode = formData.get("mode") === "snel" ? "snel" : "handmatig";
  // Makelaar/schrijfstijl: alleen een geldig id; de samengestelde FK garandeert dezelfde organisatie.
  const styleId = String(formData.get("writingStyleId") ?? "");
  const writingStyleId = idSchema.safeParse(styleId).success ? styleId : null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({ organization_id: session.organizationId, writing_style_id: writingStyleId })
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  redirect(mode === "snel" ? `/woningen/${data.id}/snelle-invoer` : `/woningen/${data.id}/gegevens`);
}

/** Autosave: valideert de gewijzigde velden en past ze atomisch toe. */
export async function savePropertyFields(
  propertyId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<{ updatedAt: string }>> {
  return runAction(async () => {
    await requireSession("properties.edit");
    if (!idSchema.safeParse(propertyId).success) throw new AppError("niet_gevonden", "Woning niet gevonden.");
    const parsed = propertyPatchSchema.safeParse(patch);
    if (!parsed.success) {
      throw new AppError("ongeldige_invoer", parsed.error.issues[0]?.message ?? "Ongeldige invoer");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("patch_property", { p_property_id: propertyId, ...patchToRpcArgs(parsed.data) });
    if (error) throw fromDbError(error);
    // Een handmatige waarde die afwijkt van een (onbevestigde) bronwaarde wordt als conflict zichtbaar.
    const { count } = await supabase
      .from("property_facts")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .in("field_name", Object.keys(parsed.data));
    if (count) await recomputeConflicts(supabase, await getProperty(propertyId));
    revalidatePath(`/woningen/${propertyId}`, "layout");
    return { updatedAt: data as string };
  });
}

export async function setDataChecked(propertyId: string, checked: boolean): Promise<ActionResult<{ checkedAt: string | null }>> {
  return runAction(async () => {
    await requireSession("properties.edit");
    if (!idSchema.safeParse(propertyId).success) throw new AppError("niet_gevonden", "Woning niet gevonden.");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("mark_property_checked", { p_property_id: propertyId, p_checked: checked });
    if (error) throw fromDbError(error);
    revalidatePath(`/woningen/${propertyId}`, "layout");
    return { checkedAt: (data as string | null) ?? null };
  });
}

export async function assignProperty(propertyId: string, userId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("properties.edit");
    if (!idSchema.safeParse(propertyId).success || !idSchema.safeParse(userId).success) {
      throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("patch_property", { p_property_id: propertyId, p_columns: { assigned_to: userId } });
    if (error) throw fromDbError(error);
    revalidatePath(`/woningen/${propertyId}`, "layout");
    return undefined;
  });
}

export async function archiveProperty(propertyId: string, archived: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("properties.archive");
    if (!idSchema.safeParse(propertyId).success) throw new AppError("niet_gevonden", "Woning niet gevonden.");
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("properties")
      .update({ deleted_at: archived ? new Date().toISOString() : null }, { count: "exact" })
      .eq("id", propertyId);
    if (error) throw fromDbError(error);
    if (!count) throw new AppError("geen_toegang", "U heeft geen rechten voor deze actie.");
    revalidatePath("/woningen");
    revalidatePath("/dashboard");
    return undefined;
  });
}

/**
 * Definitief verwijderen van een woningdossier (AVG): eerst alle bestanden uit de
 * opslag, dan documentregistraties, dan de woning met teksten, feiten en jobs.
 * Auditregels en kostenregistratie blijven bewaard, zonder inhoud of adres.
 */
export async function purgeProperty(propertyId: string, confirmation: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    await requireSession("properties.purge");
    if (!idSchema.safeParse(propertyId).success) throw new AppError("niet_gevonden", "Woning niet gevonden.");
    if (confirmation.trim().toUpperCase() !== "VERWIJDEREN") throw new AppError("ongeldige_invoer", "Typ VERWIJDEREN ter bevestiging.");
    const supabase = await createClient();
    const { data: docs, error } = await supabase.from("property_documents").select("id, storage_path").eq("property_id", propertyId);
    if (error) throw fromDbError(error);
    const paths = (docs ?? []).map((d) => d.storage_path as string);
    for (let i = 0; i < paths.length; i += 100) {
      const { error: storageError } = await supabase.storage.from("property-documents").remove(paths.slice(i, i + 100));
      if (storageError) throw new AppError("onbekend", "Niet alle bestanden konden worden verwijderd. Er is niets definitief verwijderd; probeer het opnieuw.");
    }
    if (paths.length) {
      const { error: delError } = await supabase.from("property_documents").delete().eq("property_id", propertyId);
      if (delError) throw fromDbError(delError);
    }
    const { error: purgeError } = await supabase.rpc("purge_property", { p_property_id: propertyId });
    if (purgeError) throw fromDbError(purgeError);
    revalidatePath("/woningen");
    revalidatePath("/dashboard");
    return undefined;
  });
  if (result.ok) redirect("/woningen?melding=woning-verwijderd");
  return result;
}
