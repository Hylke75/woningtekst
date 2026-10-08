import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { json, route } from "@/lib/api";
import { runNextGenerationStep } from "@/lib/pipeline/generation";
import { BACKGROUND_HEADER, continueGenerationInBackground } from "@/lib/pipeline/background";
import { getJob, publicJob } from "@/lib/pipeline/jobs";

/** Eén stap per verzoek houdt elke serverless-aanroep ruim binnen de tijdslimiet. */
export const maxDuration = 300;

export const POST = route<RouteContext<"/api/jobs/[jobId]/verder">>(async (req, { params }) => {
  const startedAt = Date.now();
  await requireSession("texts.generate_all");
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) throw new AppError("niet_gevonden", "Taak niet gevonden.");
  const supabase = await createClient();
  const existing = await getJob(supabase, jobId);
  if (existing.job_type !== "volledige_generatie") throw new AppError("ongeldige_invoer", "Onjuist taaktype.");
  if (existing.status === "voltooid" || existing.status === "geannuleerd") return json({ job: publicJob(existing) });

  // Achtergrondketen: direct antwoorden, daarna verder werken (zie background.ts).
  if (req.headers.get(BACKGROUND_HEADER) === "1") {
    continueGenerationInBackground(req, supabase, jobId, startedAt);
    return json({ job: publicJob(existing) }, 202);
  }

  const job = await runNextGenerationStep(supabase, jobId);
  // Ook als de gebruiker het tabblad nu sluit, loopt de generatie op de server door.
  if (job.status === "wachtrij") continueGenerationInBackground(req, supabase, jobId, startedAt);
  return json({ job: publicJob(job) });
});
