import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppError, fromDbError } from "@/lib/errors";
import { json, route } from "@/lib/api";
import { getJob, publicJob } from "@/lib/pipeline/jobs";

export const POST = route<RouteContext<"/api/jobs/[jobId]/annuleer">>(async (_req, { params }) => {
  await requireSession();
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) throw new AppError("niet_gevonden", "Taak niet gevonden.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_generation_job", { p_job_id: jobId });
  if (error) throw fromDbError(error);
  return json({ job: publicJob(await getJob(supabase, jobId)) });
});
