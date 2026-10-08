"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";

export type AuthFormState = { error?: string; success?: string } | undefined;

async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const loginSchema = z.object({
  email: z.email("Vul een geldig e-mailadres in").max(320),
  password: z.string().min(1, "Vul uw wachtwoord in").max(200),
  next: z.string().optional(),
});

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (error) {
    // Bewust generiek: geen onderscheid tussen onbekend account en fout wachtwoord.
    if (/email not confirmed/i.test(error.message)) {
      return { error: "Uw e-mailadres is nog niet bevestigd. Gebruik de link in de bevestigingsmail." };
    }
    if (error.status === 429) return { error: "Te veel inlogpogingen. Wacht even en probeer het opnieuw." };
    return { error: "E-mailadres of wachtwoord is onjuist." };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z.object({ email: z.email("Vul een geldig e-mailadres in") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const origin = await appOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo: `${origin}/auth/callback?volgende=/wachtwoord-instellen`,
  });
  // Altijd dezelfde melding, ook als het adres onbekend is (geen accountenumeratie).
  return { success: "Als dit e-mailadres bij ons bekend is, ontvangt u binnen enkele minuten een e-mail met een herstellink." };
}

const passwordSchema = z
  .string()
  .min(12, "Gebruik minimaal 12 tekens")
  .max(200)
  .regex(/[a-z]/, "Gebruik minimaal één kleine letter")
  .regex(/[A-Z]/, "Gebruik minimaal één hoofdletter")
  .regex(/[0-9]/, "Gebruik minimaal één cijfer");

export async function setNewPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "De wachtwoorden komen niet overeen", path: ["confirm"] })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "De herstellink is verlopen. Vraag een nieuwe link aan." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (/same/i.test(error.message)) return { error: "Kies een ander wachtwoord dan uw huidige." };
    if (/weak|pwned/i.test(error.message)) return { error: "Dit wachtwoord is te zwak of komt voor in gelekte wachtwoordlijsten." };
    return { error: "Het wachtwoord kon niet worden ingesteld. Probeer het opnieuw." };
  }
  redirect("/dashboard?melding=wachtwoord-ingesteld");
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({
      fullName: z.string().trim().min(2, "Vul uw naam in").max(200),
      email: z.email("Vul een geldig e-mailadres in").max(320),
      password: passwordSchema,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const origin = await appOrigin();
  await supabase.auth.signUp({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback?volgende=/dashboard`,
    },
  });
  // Toegang ontstaat alleen via een geldige uitnodiging (databasetrigger na e-mailbevestiging).
  return {
    success: "Controleer uw e-mail en klik op de bevestigingslink. Heeft u een uitnodiging ontvangen, dan heeft u daarna direct toegang.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/inloggen?melding=uitgelogd");
}
