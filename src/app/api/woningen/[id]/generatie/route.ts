import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data/properties";
import { aiConfigured } from "@/lib/env";
import { AppError, fromDbError } from "@/lib/errors";
import { idempotencyKeySchema, json, parseJson, route } from "@/lib/api";
import { getActiveStyleGuide, SLOTS } from "@/lib/data/content";
import { assertReadyForGeneration, generationInputHash, protectedSlots } from "@/lib/pipeline/generation";
import { createOrGetJob, publicJob } from "@/lib/pipeline/jobs";
import { continueGenerationInBackground } from "@/lib/pipeline/background";
import type { JobRow } from "@/lib/db-types";
import { WRITING_STYLE_KEYS } from "@/lib/content/writing-styles";

/** De eerste stappen kunnen direct na het antwoord in deze aanroep worden uitgevoerd. */
export const maxDuration = 300;

const slotKeys = SLOTS.map((s) => s.key) as [string, ...string[]];

const bodySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  overwriteSlots: z.array(z.enum(slotKeys)).max(8).default([]),
  schrijfstijl: z.enum(WRITING_STYLE_KEYS).default("schrijfwijzer"),
});

/** Status van de laatste volledige generatie en welke teksten beschermd zijn. */
export const GET = route<RouteContext<"/api/woningen/[id]/generatie">>(async (_req, { params }) => {
  await requireSession();
  const { id } = await params;
  const property = await getProperty(id);
  const supabase = await createClient();
  const [{ data, error }, prot] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("*")
      .eq("property_id", property.id)
      .eq("job_type", "volledige_generatie")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    protectedSlots(supabase, property.id),
  ]);
  if (error) throw fromDbError(error);
  return json({ job: data ? publicJob(data as JobRow) : null, protectedSlots: prot });
});

/** Start (of hervat bij dezelfde sleutel) een volledige generatie van alle acht teksten. */
export const POST = route<RouteContext<"/api/woningen/[id]/generatie">>(async (req, { params }) => {
  const startedAt = Date.now();
  const session = await requireSession("texts.generate_all");
  const { id } = await params;
  const property = await getProperty(id);
  const body = await parseJson(req, bodySchema, 5_000);
  if (!aiConfigured()) throw new AppError("ai_niet_geconfigureerd", "Claude is nog niet gekoppeld. Neem contact op met een administrator.");
  const supabase = await createClient();
  await assertReadyForGeneration(supabase, property);
  const guide = await getActiveStyleGuide(supabase);
  const { job } = await createOrGetJob(supabase, {
    organizationId: session.organizationId,
    userId: session.userId,
    propertyId: property.id,
    jobType: "volledige_generatie",
    idempotencyKey: body.idempotencyKey,
    params: { overwriteSlots: body.overwriteSlots, schrijfstijl: body.schrijfstijl },
    inputHash: generationInputHash(property, guide.id, body.overwriteSlots, body.schrijfstijl),
  });
  // Start de verwerking direct op de server; de browser hoeft niet open te blijven.
  if (job.status === "wachtrij") continueGenerationInBackground(req, supabase, job.id, startedAt);
  return json({ job: publicJob(job) }, 201);
});
