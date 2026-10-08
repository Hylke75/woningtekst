import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { totp, totpStep } from "./totp";

/**
 * MFA-hulpfuncties voor integratie- en E2E-tests tegen de LOKALE Supabase-stack.
 * De productiecode kent geen MFA-uitzondering; tests schrijven een echte
 * TOTP-factor in en genereren codes met tests/helpers/totp.ts.
 */

function assertLocal(url: string) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    throw new Error("MFA-testhelpers zijn alleen bedoeld voor een lokale Supabase-stack.");
  }
}

/** Verwijdert alle MFA-factoren van een testgebruiker via de admin-API (lokale secret key). */
export async function resetMfaFactors(url: string, secretKey: string, email: string) {
  assertLocal(url);
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) return;
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const f of factors?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
  }
}

const lastStep = new Map<string, number>();

/** Een verse code; wacht op het volgende tijdvak als de vorige code al gebruikt is. */
export async function freshTotp(secret: string): Promise<string> {
  let step = totpStep();
  if (lastStep.get(secret) === step) {
    await new Promise((r) => setTimeout(r, (step + 1) * 30_000 - Date.now() + 250));
    step = totpStep();
  }
  lastStep.set(secret, step);
  return totp(secret);
}

/** Schrijft een TOTP-factor in voor een ingelogde client en verifieert die (sessie wordt aal2). */
export async function enrollTotp(client: SupabaseClient): Promise<{ factorId: string; secret: string }> {
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `test-${Date.now()}` });
  if (error || !data || data.type !== "totp") throw error ?? new Error("TOTP-inschrijving mislukt");
  const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: data.id, code: await freshTotp(data.totp.secret) });
  if (verifyError) throw verifyError;
  return { factorId: data.id, secret: data.totp.secret };
}
