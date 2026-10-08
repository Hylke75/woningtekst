import "server-only";
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { serverEnv } from "@/lib/env";
import { AppError, quotaError } from "@/lib/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import { estimateCostEur } from "@/lib/ai/pricing";
import { getAiTransport, type AiContentBlock } from "@/lib/ai/transport";

export type AiCallOptions<S extends z.ZodType> = {
  supabase: ServerSupabase;
  operation: string;
  schema: S;
  system: string;
  content: AiContentBlock[];
  propertyId?: string | null;
  jobId?: string | null;
  maxTokens?: number;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  mockInput?: unknown;
};

export type AiCallResult<T> = { data: T; model: string; costEur: number; inputTokens: number; outputTokens: number };

const schemaCache = new WeakMap<object, Record<string, unknown>>();

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  let s = schemaCache.get(schema);
  if (!s) {
    s = zodOutputFormat(schema).schema as Record<string, unknown>;
    schemaCache.set(schema, s);
  }
  return s;
}

/**
 * Eén gecontroleerde Claude-aanroep:
 * 1. reserveert quota in de database (rate limit, dag-/maandbudget) via server-RPC;
 * 2. roept Claude aan met structured output, timeout en SDK-retries;
 * 3. valideert het antwoord met Zod (één extra poging bij ongeldige JSON);
 * 4. registreert tokens en geschatte kosten, ook bij fouten.
 */
export async function callClaude<S extends z.ZodType>(opts: AiCallOptions<S>): Promise<AiCallResult<z.infer<S>>> {
  const env = serverEnv();
  const model = opts.model ?? env.ANTHROPIC_MODEL;
  const transport = getAiTransport();
  const maxAttempts = 2;
  let lastError: AppError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data: reservation, error: reserveError } = await opts.supabase.rpc("server_ai_reserve", {
      p_secret: env.SERVER_RPC_SECRET,
      p_operation: opts.operation,
      p_model: model,
      p_property_id: opts.propertyId ?? null,
      p_job_id: opts.jobId ?? null,
    });
    if (reserveError) throw new AppError("configuratie", "AI-verbruik kon niet worden geregistreerd. Controleer de serverconfiguratie.");
    const res = reservation as { allowed: boolean; reason?: string; event_id?: string };
    if (!res.allowed || !res.event_id) throw quotaError(res.reason ?? "onbekend");

    const started = Date.now();
    let usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens?: number } = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
    };
    let servedModel = model;
    try {
      const response = await transport.complete({
        operation: opts.operation,
        model,
        system: opts.system,
        content: opts.content,
        jsonSchema: jsonSchemaFor(opts.schema),
        maxTokens: opts.maxTokens ?? 16000,
        effort: opts.effort ?? env.ANTHROPIC_EFFORT,
        timeoutMs: env.ANTHROPIC_TIMEOUT_MS,
        mockInput: opts.mockInput,
      });
      usage = response.usage;
      servedModel = response.model || model;

      if (response.stopReason === "refusal") {
        throw new AppError("ai_geweigerd", "Claude heeft dit verzoek geweigerd. Pas de invoer aan of neem contact op met een administrator.", 422, false);
      }
      if (response.stopReason === "max_tokens") {
        throw new AppError("ai_ongeldig_antwoord", "Het antwoord van Claude was te lang en is afgebroken.", 502, true);
      }
      let json: unknown;
      try {
        json = JSON.parse(response.text);
      } catch {
        throw new AppError("ai_ongeldig_antwoord", "Claude gaf een onleesbaar antwoord.", 502, true);
      }
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new AppError("ai_ongeldig_antwoord", "Het antwoord van Claude voldeed niet aan het verwachte formaat.", 502, true);
      }
      const costEur = estimateCostEur(servedModel, usage, env.AI_USD_TO_EUR);
      await finish(opts.supabase, res.event_id, "succes", usage, costEur, null, Date.now() - started);
      return { data: parsed.data, model: servedModel, costEur, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
    } catch (err) {
      const appErr = err instanceof AppError ? err : new AppError("ai_fout", "Onverwachte fout bij Claude.", 502, true);
      const costEur = estimateCostEur(servedModel, usage, env.AI_USD_TO_EUR);
      await finish(opts.supabase, res.event_id, "fout", usage, costEur, appErr.code, Date.now() - started);
      lastError = appErr;
      // Alleen een ongeldig antwoord wordt hier opnieuw geprobeerd; netwerk- en
      // overbelastingsfouten zijn al door de SDK met backoff herhaald.
      if (appErr.code !== "ai_ongeldig_antwoord" || attempt === maxAttempts) throw appErr;
    }
  }
  throw lastError ?? new AppError("ai_fout", "Onbekende AI-fout.");
}

async function finish(
  supabase: ServerSupabase,
  eventId: string,
  status: "succes" | "fout",
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens?: number },
  cost: number,
  errorCode: string | null,
  durationMs: number,
) {
  const env = serverEnv();
  const { error } = await supabase.rpc("server_ai_finish", {
    p_secret: env.SERVER_RPC_SECRET,
    p_event_id: eventId,
    p_status: status,
    // Cache-schrijftokens tellen als input (de kosten zijn al met 1,25× berekend).
    p_input_tokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
    p_output_tokens: usage.output_tokens,
    p_cache_read_tokens: usage.cache_read_input_tokens,
    p_estimated_cost: cost,
    p_error_code: errorCode,
    p_duration_ms: durationMs,
  });
  if (error) console.error("[ai] verbruik kon niet worden afgerond", error.code);
}
