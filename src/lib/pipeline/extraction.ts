import "server-only";
import { callClaude } from "@/lib/ai/call";
import { EXTRACTION_SYSTEM, extractionFieldList } from "@/lib/ai/prompts";
import { extractionSchema, type ExtractionOutput } from "@/lib/ai/schemas";
import { maskPersonalData } from "@/lib/ai/pii";
import { detectContent, type AllowedMime } from "@/lib/documents/validate";
import { extractSource, MAX_SOURCE_CHARS } from "@/lib/documents/extract-text";
import { FIELD_BY_KEY, fieldValueSchema } from "@/lib/domain/property-fields";
import { getFieldValue, patchToRpcArgs } from "@/lib/domain/property-mapping";
import { AppError, fromDbError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/auth/session";
import type { DocumentRow, FactRow, PropertyRow } from "@/lib/db-types";
import { claimJob, createOrGetJob, failJob, hashInput, updateJob } from "@/lib/pipeline/jobs";
import { mockProfile } from "@/lib/pipeline/generation";

export const BUCKET = "property-documents";
export const MAX_PASTED_CHARS = 100_000;

export type ExtractionSource = { type: "document"; documentId: string } | { type: "text"; text: string };

/** Vergelijkbare vorm van een waarde (voor conflictdetectie). */
export function normalizeFactValue(field: string, value: unknown): string {
  const f = FIELD_BY_KEY.get(field);
  const str = String(value ?? "").trim();
  if (f && (f.kind === "integer" || f.kind === "currency")) return str.replace(/[^\d]/g, "");
  if (f?.kind === "postcode") return str.replace(/\s/g, "").toUpperCase();
  return str.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
}

/** Valideert en normaliseert een door AI aangeleverde waarde; null als ongeldig. */
export function coerceExtractedValue(field: string, raw: string): unknown | null {
  const f = FIELD_BY_KEY.get(field);
  if (!f || !f.extractable) return null;
  let candidate: unknown = raw;
  if (f.kind === "select" && f.options) {
    const match = f.options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());
    if (!match) return null;
    candidate = match;
  }
  const parsed = fieldValueSchema(field).safeParse(candidate);
  if (!parsed.success || parsed.data === null || parsed.data === undefined || parsed.data === "") return null;
  return parsed.data;
}

type FactInsert = Pick<FactRow, "field_name" | "field_value" | "source_reference" | "source_quote" | "confidence">;

export function factsFromOutput(output: ExtractionOutput): { facts: FactInsert[]; rejected: number } {
  const facts: FactInsert[] = [];
  let rejected = 0;
  const seen = new Set<string>();
  for (const f of output.feiten) {
    const value = coerceExtractedValue(f.veld, f.waarde);
    if (value === null) {
      rejected++;
      continue;
    }
    const key = `${f.veld}|${normalizeFactValue(f.veld, value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      field_name: f.veld,
      field_value: String(value).slice(0, 4000),
      source_reference: f.locatie?.slice(0, 500) || null,
      source_quote: f.citaat?.slice(0, 1000) || null,
      confidence: f.betrouwbaarheid,
    });
  }
  return { facts, rejected };
}

/**
 * Herberekent conflictstatussen per veld. De applicatie kiest NOOIT zelf welke
 * waarde juist is: verschillende waarden uit verschillende bronnen worden
 * "conflict" totdat een medewerker kiest.
 */
export async function recomputeConflicts(supabase: ServerSupabase, property: PropertyRow): Promise<number> {
  const { data, error } = await supabase
    .from("property_facts")
    .select("id, field_name, field_value, verification_status")
    .eq("property_id", property.id)
    .neq("verification_status", "afgewezen");
  if (error) throw fromDbError(error);
  const byField = new Map<string, { id: string; value: string; status: string }[]>();
  for (const r of data ?? []) {
    const list = byField.get(r.field_name) ?? [];
    list.push({ id: r.id, value: normalizeFactValue(r.field_name, r.field_value), status: r.verification_status });
    byField.set(r.field_name, list);
  }
  const toConflict: string[] = [];
  const toUnverified: string[] = [];
  for (const [field, list] of byField) {
    const confirmed = list.filter((l) => l.status === "bevestigd").map((l) => l.value);
    const current = getFieldValue(property, field);
    const currentNorm = current === null || current === undefined || current === "" ? null : normalizeFactValue(field, current);
    const distinct = new Set(list.map((l) => l.value));
    for (const l of list) {
      if (l.status === "bevestigd") continue;
      const differsFromConfirmed = confirmed.length > 0 && !confirmed.includes(l.value);
      const conflict = differsFromConfirmed || (confirmed.length === 0 && (distinct.size > 1 || (currentNorm !== null && currentNorm !== l.value)));
      if (conflict && l.status !== "conflict") toConflict.push(l.id);
      if (!conflict && l.status === "conflict") toUnverified.push(l.id);
    }
  }
  if (toConflict.length) {
    const { error: e } = await supabase.from("property_facts").update({ verification_status: "conflict" }).in("id", toConflict);
    if (e) throw fromDbError(e);
  }
  if (toUnverified.length) {
    const { error: e } = await supabase.from("property_facts").update({ verification_status: "onbevestigd" }).in("id", toUnverified);
    if (e) throw fromDbError(e);
  }
  const { count } = await supabase
    .from("property_facts")
    .select("id", { count: "exact", head: true })
    .eq("property_id", property.id)
    .eq("verification_status", "conflict");
  return count ?? 0;
}

/** Vult lege woningvelden met niet-conflicterende voorstellen (blijven 'onbevestigd' tot controle). */
async function applySuggestions(supabase: ServerSupabase, property: PropertyRow) {
  const { data, error } = await supabase
    .from("property_facts")
    .select("field_name, field_value, verification_status")
    .eq("property_id", property.id)
    .eq("verification_status", "onbevestigd");
  if (error) throw fromDbError(error);
  const patch: Record<string, unknown> = {};
  for (const r of data ?? []) {
    const current = getFieldValue(property, r.field_name);
    if (current !== null && current !== undefined && current !== "") continue;
    if (patch[r.field_name] !== undefined) continue;
    const value = coerceExtractedValue(r.field_name, r.field_value);
    if (value !== null) patch[r.field_name] = value;
  }
  if (Object.keys(patch).length === 0) return 0;
  const { error: e } = await supabase.rpc("patch_property", { p_property_id: property.id, ...patchToRpcArgs(patch) });
  if (e) throw fromDbError(e);
  return Object.keys(patch).length;
}

export async function runExtraction(args: {
  supabase: ServerSupabase;
  session: SessionContext;
  property: PropertyRow;
  source: ExtractionSource;
  idempotencyKey: string;
}) {
  const { supabase, session, property, source } = args;
  let document: DocumentRow | null = null;
  if (source.type === "document") {
    const { data, error } = await supabase.from("property_documents").select("*").eq("id", source.documentId).eq("property_id", property.id).maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("niet_gevonden", "Document niet gevonden.");
    document = data as DocumentRow;
  } else if (!source.text.trim() || source.text.length > MAX_PASTED_CHARS) {
    throw new AppError("ongeldige_invoer", `Plak een tekst van maximaal ${MAX_PASTED_CHARS.toLocaleString("nl-NL")} tekens.`);
  }

  const { job, created } = await createOrGetJob(supabase, {
    organizationId: session.organizationId,
    userId: session.userId,
    propertyId: property.id,
    jobType: "extractie",
    idempotencyKey: args.idempotencyKey,
    params: source.type === "document" ? { documentId: source.documentId } : { pasted: true, length: source.text.length },
    inputHash: hashInput(source.type === "document" ? document!.sha256 : hashInput(source.text)),
  });
  if (!created && job.status === "voltooid") return { job, summary: job.steps.result as ExtractionSummary | undefined };

  const claimed = await claimJob(supabase, job.id);
  if (!claimed) throw new AppError("conflict", "Deze bron wordt al geanalyseerd.");
  if (document) await supabase.from("property_documents").update({ extraction_status: "bezig", extraction_error: null }).eq("id", document.id);

  try {
    const keep = [getFieldValue(property, "publicatie.telefoon"), getFieldValue(property, "publicatie.email")].filter(Boolean).map(String);
    let content: Parameters<typeof callClaude>[0]["content"];
    let truncated = false;
    let masked: Record<string, number> = {};
    const label = document ? `${document.filename}` : "Geplakte woningomschrijving";

    if (document) {
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(document.storage_path);
      if (error || !blob) throw new AppError("niet_gevonden", "Het bestand kon niet uit de opslag worden gelezen.");
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const check = await detectContent(buffer, document.mime_type);
      if (!check.ok) throw new AppError("bestand_ongeldig", check.reason);
      const extracted = await extractSource(buffer, document.mime_type as AllowedMime);
      if (extracted.kind === "image") {
        content = [
          { type: "image", mediaType: extracted.mediaType, base64: extracted.base64 },
          {
            type: "text",
            text: `<toegestane_velden>\n${extractionFieldList()}\n</toegestane_velden>\n\nDe afbeelding hierboven is de bron "${label}" (type: ${document.document_type}). Haal alleen zichtbare woninggegevens eruit, zoals maten op een plattegrond of een energielabel. Persoonsgegevens neem je nooit op.`,
          },
        ];
      } else {
        const m = maskPersonalData(extracted.text, keep);
        masked = m.counts;
        truncated = extracted.truncated;
        content = [
          {
            type: "text",
            text: `<toegestane_velden>\n${extractionFieldList()}\n</toegestane_velden>\n\n<document bron="${label.replace(/"/g, "'")}" type="${document.document_type}">\n${m.text}\n</document>\n\nHaal de woninggegevens uit dit document.`,
          },
        ];
      }
    } else {
      const m = maskPersonalData((source as { text: string }).text.slice(0, MAX_SOURCE_CHARS), keep);
      masked = m.counts;
      content = [
        {
          type: "text",
          text: `<toegestane_velden>\n${extractionFieldList()}\n</toegestane_velden>\n\n<document bron="geplakte tekst">\n${m.text}\n</document>\n\nHaal de woninggegevens uit dit document.`,
        },
      ];
    }

    const r = await callClaude({
      supabase,
      operation: "extractie",
      schema: extractionSchema,
      system: EXTRACTION_SYSTEM,
      content,
      propertyId: property.id,
      jobId: job.id,
      maxTokens: 16000,
      model: serverEnv().ANTHROPIC_EXTRACTION_MODEL,
      mockInput: mockProfile(property),
    });

    const { facts, rejected } = factsFromOutput(r.data);
    const { count: existing } = await supabase.from("property_facts").select("id", { count: "exact", head: true }).eq("extraction_job_id", job.id);
    if (!existing && facts.length) {
      const { error } = await supabase.from("property_facts").insert(
        facts.map((f) => ({
          ...f,
          property_id: property.id,
          organization_id: property.organization_id,
          source_type: document ? "document" : "geplakte_tekst",
          source_document_id: document?.id ?? null,
          extraction_job_id: job.id,
        })),
      );
      if (error) throw fromDbError(error);
    }

    const notes = [
      ...r.data.opmerkingen,
      ...(truncated ? [`De bron is langer dan ${MAX_SOURCE_CHARS.toLocaleString("nl-NL")} tekens; alleen het eerste deel is geanalyseerd. Splits het document of plak de relevante delen apart.`] : []),
      ...(rejected ? [`${rejected} gevonden gegeven(s) voldeden niet aan het verwachte formaat en zijn niet overgenomen.`] : []),
    ];
    if (notes.length) {
      await supabase.from("review_issues").insert(
        notes.map((n) => ({
          property_id: property.id,
          organization_id: property.organization_id,
          generation_job_id: job.id,
          severity: /instructies|langer dan/i.test(n) ? "waarschuwing" : "info",
          category: "extractie",
          description: n.slice(0, 2000),
          source_details: label.slice(0, 2000),
        })),
      );
    }

    const { data: fresh } = await supabase.from("properties").select("*").eq("id", property.id).single();
    const conflicts = await recomputeConflicts(supabase, (fresh ?? property) as PropertyRow);
    const applied = await applySuggestions(supabase, (fresh ?? property) as PropertyRow);

    if (document) await supabase.from("property_documents").update({ extraction_status: "voltooid", extraction_error: null }).eq("id", document.id);
    const summary: ExtractionSummary = { facts: facts.length, conflicts, applied, masked, truncated };
    const done = await updateJob(supabase, job.id, { status: "voltooid", currentStep: "voltooid", steps: { result: summary } });
    return { job: done, summary };
  } catch (err) {
    if (document) {
      await supabase
        .from("property_documents")
        .update({ extraction_status: "mislukt", extraction_error: err instanceof AppError ? err.message.slice(0, 500) : "Analyse mislukt." })
        .eq("id", document.id);
    }
    await failJob(supabase, job.id, err);
    throw err;
  }
}

export type ExtractionSummary = { facts: number; conflicts: number; applied: number; masked: Record<string, number>; truncated: boolean };
