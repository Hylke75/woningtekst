import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { json, route } from "@/lib/api";
import { runNextGenerationStep } from "@/lib/pipeline/generation";
import { getJob, publicJob } from "@/lib/pipeline/jobs";

/** Eén stap per verzoek houdt elke serverless-aanroep ruim binnen de tijdslimiet. */
export const maxDuration = 300;

export const POST = route<RouteContext<"/api/jobs/[jobId]/verder">>(async (_req, { params }) => {
  await requireSession("texts.generate_all");
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) throw new AppError("niet_gevonden", "Taak niet gevonden.");
  const supabase = await createClient();
  const existing = await getJob(supabase, jobId);
  if (existing.job_type !== "volledige_generatie") throw new AppError("ongeldige_invoer", "Onjuist taaktype.");
  if (existing.status === "voltooid" || existing.status === "geannuleerd") return json({ job: publicJob(existing) });
  const job = await runNextGenerationStep(supabase, jobId);
  return json({ job: publicJob(job) });
});
