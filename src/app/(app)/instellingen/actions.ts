"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { AppError, fromDbError, runAction, type ActionResult } from "@/lib/errors";

export async function updateOwnName(fullName: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    const parsed = z.string().trim().min(2, "Vul uw naam in").max(200).safeParse(fullName);
    if (!parsed.success) throw new AppError("ongeldige_invoer", parsed.error.issues[0]?.message ?? "Ongeldige naam.");
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name: parsed.data }).eq("id", session.userId);
    if (error) throw fromDbError(error);
    revalidatePath("/", "layout");
    return undefined;
  });
}

const settingsSchema = z.object({
  ai_daily_cost_limit_eur: z.coerce.number().min(0).max(100000),
  ai_monthly_cost_limit_eur: z.coerce.number().min(0).max(1000000),
  ai_requests_per_minute_per_user: z.coerce.number().int().min(1).max(600),
  ai_daily_requests_per_user: z.coerce.number().int().min(1).max(100000),
  approval_roles: z.array(z.enum(["admin", "makelaar", "redacteur"])).min(1, "Kies minimaal één rol met goedkeuringsrechten").refine((r) => r.includes("admin"), "Administrator moet altijd kunnen goedkeuren"),
  retention_months_after_sale: z.coerce.number().int().min(1).max(240),
  retention_months_inactive_concept: z.coerce.number().int().min(1).max(240),
});

export async function updateOrganizationSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession("settings.edit");
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", parsed.error.issues[0]?.message ?? "Ongeldige invoer.");
    if (parsed.data.ai_monthly_cost_limit_eur < parsed.data.ai_daily_cost_limit_eur) {
      throw new AppError("ongeldige_invoer", "Het maandbudget moet minimaal gelijk zijn aan het dagbudget.");
    }
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("organization_settings")
      .update({ ...parsed.data, updated_by: session.userId }, { count: "exact" })
      .eq("organization_id", session.organizationId);
    if (error) throw fromDbError(error);
    if (!count) throw new AppError("geen_toegang", "U heeft geen rechten om de instellingen te wijzigen.");
    revalidatePath("/instellingen");
    return undefined;
  });
}
