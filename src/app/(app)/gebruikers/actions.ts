"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/session";
import { AppError, fromDbError, runAction, type ActionResult } from "@/lib/errors";

const roleSchema = z.enum(["admin", "makelaar", "redacteur"]);

async function origin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

export async function inviteUser(input: { email: string; role: string }): Promise<ActionResult<{ emailSent: boolean; registerUrl: string }>> {
  return runAction(async () => {
    await requireSession("users.manage");
    const parsed = z.object({ email: z.email("Vul een geldig e-mailadres in").max(320), role: roleSchema }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", parsed.error.issues[0]?.message ?? "Ongeldige invoer.");
    const email = parsed.data.email.toLowerCase().trim();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_create_invitation", { p_email: email, p_role: parsed.data.role });
    if (error) throw fromDbError(error);

    const base = await origin();
    let emailSent = false;
    const admin = createAdminClient();
    if (admin) {
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${base}/auth/callback?volgende=/wachtwoord-instellen`,
      });
      // Bestaat het account al, dan is de uitnodiging in de database voldoende (direct gekoppeld of bij bevestiging).
      emailSent = !inviteError;
    }
    revalidatePath("/gebruikers");
    return { emailSent, registerUrl: `${base}/registreren` };
  });
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("users.manage");
    if (!z.uuid().safeParse(id).success) throw new AppError("niet_gevonden", "Uitnodiging niet gevonden.");
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_revoke_invitation", { p_id: id });
    if (error) throw fromDbError(error);
    revalidatePath("/gebruikers");
    return undefined;
  });
}

export async function updateMember(input: { userId: string; role: string; isActive: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession("users.manage");
    const parsed = z.object({ userId: z.uuid(), role: roleSchema, isActive: z.boolean() }).safeParse(input);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_update_member", {
      p_user_id: parsed.data.userId,
      p_role: parsed.data.role,
      p_is_active: parsed.data.isActive,
    });
    if (error) throw fromDbError(error);
    revalidatePath("/gebruikers");
    return undefined;
  });
}
