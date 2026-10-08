"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { AppError, fromDbError, runAction, type ActionResult } from "@/lib/errors";
import { FIELD_BY_KEY } from "@/lib/domain/property-fields";
import { patchToRpcArgs } from "@/lib/domain/property-mapping";
import { coerceExtractedValue, normalizeFactValue, recomputeConflicts } from "@/lib/pipeline/extraction";
import { getProperty } from "@/lib/data/properties";
import type { FactRow } from "@/lib/db-types";

const fieldSchema = z.string().refine((f) => FIELD_BY_KEY.has(f), "Onbekend veld");

/**
 * De medewerker kiest welke waarde juist is. Die waarde wordt in het
 * woningprofiel gezet; feiten met dezelfde waarde worden bevestigd, afwijkende
 * feiten afgewezen. De applicatie maakt deze keuze nooit zelf.
 */
export async function chooseFactValue(input: { propertyId: string; field: string; factId: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("facts.verify");
    const parsed = z.object({ propertyId: z.uuid(), field: fieldSchema, factId: z.uuid() }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    const { propertyId, field, factId } = parsed.data;
    const supabase = await createClient();
    const { data: facts, error } = await supabase.from("property_facts").select("*").eq("property_id", propertyId).eq("field_name", field);
    if (error) throw fromDbError(error);
    const chosen = (facts as FactRow[]).find((f) => f.id === factId);
    if (!chosen) throw new AppError("niet_gevonden", "Gegeven niet gevonden.");
    const value = coerceExtractedValue(field, chosen.field_value) ?? chosen.field_value;
    const { error: patchError } = await supabase.rpc("patch_property", { p_property_id: propertyId, ...patchToRpcArgs({ [field]: value }) });
    if (patchError) throw fromDbError(patchError);
    await settleField(supabase, facts as FactRow[], field, normalizeFactValue(field, value));
    await recomputeConflicts(supabase, await getProperty(propertyId));
    revalidatePath(`/woningen/${propertyId}`, "layout");
    return undefined;
  });
}

/** Bevestigt de huidige (handmatig ingevoerde) waarde als juist. */
export async function confirmCurrentValue(input: { propertyId: string; field: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("facts.verify");
    const parsed = z.object({ propertyId: z.uuid(), field: fieldSchema }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    const { propertyId, field } = parsed.data;
    const supabase = await createClient();
    const property = await getProperty(propertyId);
    const { getFieldValue } = await import("@/lib/domain/property-mapping");
    const current = getFieldValue(property, field);
    if (current === null || current === undefined || current === "") throw new AppError("ongeldige_invoer", "Dit veld is nog niet ingevuld.");
    const { data: facts, error } = await supabase.from("property_facts").select("*").eq("property_id", propertyId).eq("field_name", field);
    if (error) throw fromDbError(error);
    await settleField(supabase, facts as FactRow[], field, normalizeFactValue(field, current));
    // Handmatige bevestiging vastleggen als eigen bron.
    if (!(facts as FactRow[]).some((f) => normalizeFactValue(field, f.field_value) === normalizeFactValue(field, current))) {
      const { error: insertError } = await supabase.from("property_facts").insert({
        property_id: propertyId,
        organization_id: property.organization_id,
        field_name: field,
        field_value: String(current).slice(0, 4000),
        source_type: "handmatig",
        source_reference: "Handmatig bevestigd",
        confidence: "hoog",
        verification_status: "bevestigd",
      });
      if (insertError) throw fromDbError(insertError);
    }
    await recomputeConflicts(supabase, property);
    revalidatePath(`/woningen/${propertyId}`, "layout");
    return undefined;
  });
}

export async function rejectFact(input: { propertyId: string; factId: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("facts.verify");
    const parsed = z.object({ propertyId: z.uuid(), factId: z.uuid() }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    const supabase = await createClient();
    const { error } = await supabase.from("property_facts").update({ verification_status: "afgewezen" }).eq("id", parsed.data.factId).eq("property_id", parsed.data.propertyId);
    if (error) throw fromDbError(error);
    await recomputeConflicts(supabase, await getProperty(parsed.data.propertyId));
    revalidatePath(`/woningen/${parsed.data.propertyId}`, "layout");
    return undefined;
  });
}

async function settleField(supabase: Awaited<ReturnType<typeof createClient>>, facts: FactRow[], field: string, chosenNorm: string) {
  const confirm = facts.filter((f) => normalizeFactValue(field, f.field_value) === chosenNorm && f.verification_status !== "bevestigd").map((f) => f.id);
  const reject = facts.filter((f) => normalizeFactValue(field, f.field_value) !== chosenNorm && f.verification_status !== "afgewezen").map((f) => f.id);
  if (confirm.length) {
    const { error } = await supabase.from("property_facts").update({ verification_status: "bevestigd" }).in("id", confirm);
    if (error) throw fromDbError(error);
  }
  if (reject.length) {
    const { error } = await supabase.from("property_facts").update({ verification_status: "afgewezen" }).in("id", reject);
    if (error) throw fromDbError(error);
  }
}
