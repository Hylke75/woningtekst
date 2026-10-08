import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { AppError, fromDbError, toSafeError } from "@/lib/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { JobRow, JobStatus, JobType } from "@/lib/db-types";

export function hashInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Een job geldt als vastgelopen als er langer dan dit aantal seconden geen hartslag was. */
export const STALE_SECONDS = 360;

/**
 * Maakt een job aan of geeft de bestaande job met dezelfde idempotency key terug.
 * Dubbelklikken of een herhaald verzoek start dus nooit een tweede (betaalde) job.
 */
export async function createOrGetJob(
  supabase: ServerSupabase,
  args: {
    organizationId: string;
    userId: string;
    propertyId: string | null;
    jobType: JobType;
    idempotencyKey: string;
    params: Record<string, unknown>;
    inputHash: string;
  },
): Promise<{ job: JobRow; created: boolean }> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      organization_id: args.organizationId,
      requested_by: args.userId,
      property_id: args.propertyId,
      job_type: args.jobType,
      idempotency_key: args.idempotencyKey,
      params: args.params,
      input_hash: args.inputHash,
    })
    .select("*")
    .single();
  if (!error) return { job: data as JobRow, created: true };
  if (error.code === "23505") {
    const existing = await supabase
      .from("generation_jobs")
      .select("*")
      .or(
        args.propertyId && args.jobType === "volledige_generatie"
          ? `idempotency_key.eq.${args.idempotencyKey},and(property_id.eq.${args.propertyId},job_type.eq.volledige_generatie,status.in.(wachtrij,bezig))`
          : `idempotency_key.eq.${args.idempotencyKey}`,
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.data) return { job: existing.data as JobRow, created: false };
  }
  throw fromDbError(error);
}

export async function getJob(supabase: ServerSupabase, jobId: string): Promise<JobRow> {
  const { data, error } = await supabase.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("niet_gevonden", "Taak niet gevonden.");
  return data as JobRow;
}

/** Claimt de job voor verwerking door dit verzoek; null als een ander verzoek er al (recent) mee bezig is. */
export async function claimJob(supabase: ServerSupabase, jobId: string): Promise<JobRow | null> {
  const { data, error } = await supabase.rpc("server_job_claim", {
    p_secret: serverEnv().SERVER_RPC_SECRET,
    p_job_id: jobId,
    p_stale_seconds: STALE_SECONDS,
  });
  if (error) throw fromDbError(error);
  const row = data as JobRow | null;
  return row && row.id ? row : null;
}

export async function updateJob(
  supabase: ServerSupabase,
  jobId: string,
  patch: { status?: JobStatus; currentStep?: string; steps?: Record<string, unknown>; errorCode?: string; errorMessage?: string },
): Promise<JobRow> {
  const { data, error } = await supabase.rpc("server_job_update", {
    p_secret: serverEnv().SERVER_RPC_SECRET,
    p_job_id: jobId,
    p_status: patch.status ?? null,
    p_current_step: patch.currentStep ?? null,
    p_steps_patch: patch.steps ?? null,
    p_error_code: patch.errorCode ?? null,
    p_error_message: patch.errorMessage ?? null,
  });
  if (error) throw fromDbError(error);
  return data as JobRow;
}

export async function failJob(supabase: ServerSupabase, jobId: string, err: unknown): Promise<JobRow> {
  const safe = toSafeError(err);
  return updateJob(supabase, jobId, { status: "mislukt", errorCode: safe.code, errorMessage: safe.message });
}

/** Publieke weergave van een job voor de client (zonder interne stapdata). */
export function publicJob(job: JobRow) {
  const stale = job.status === "bezig" && job.heartbeat_at !== null && Date.now() - new Date(job.heartbeat_at).getTime() > STALE_SECONDS * 1000;
  return {
    id: job.id,
    type: job.job_type,
    status: stale ? ("onderbroken" as const) : job.status,
    currentStep: job.current_step,
    completedSteps: Object.keys(job.steps ?? {}),
    errorCode: job.error_code,
    errorMessage: job.error_message,
    attemptCount: job.attempt_count,
    estimatedCost: Number(job.estimated_cost),
    createdAt: job.created_at,
    finishedAt: job.finished_at,
  };
}
export type PublicJob = ReturnType<typeof publicJob>;
