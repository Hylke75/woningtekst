"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { normalizeTotpCode, qrCodeDataUrl } from "@/lib/auth/mfa";
import { AppError, runAction, type ActionResult } from "@/lib/errors";

const ISSUER = "Korff de Gidts Woningtekst";
const FRIENDLY_NAME = "Authenticator-app";
const factorId = z.uuid();

export type MfaEnrollment = { factorId: string; qrCode: string | null; secret: string };

/** Vraagt de factoren op bij de Auth-server (niet uit de sessiecookie). */
async function listOwnFactors() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) throw new AppError("onbekend", "De beveiligingsinstellingen konden niet worden geladen. Probeer het opnieuw.");
  return { supabase, factors: data.all };
}

/** Stap 1: nieuwe TOTP-factor aanmaken; levert QR-code en geheime sleutel. */
export async function startMfaEnrollment(): Promise<ActionResult<MfaEnrollment>> {
  return runAction(async () => {
    await requireSession();
    const { supabase, factors } = await listOwnFactors();
    if (factors.some((f) => f.factor_type === "totp" && f.status === "verified")) {
      throw new AppError("conflict", "U heeft al een authenticator-app ingesteld. Verwijder die eerst als u een andere wilt koppelen.");
    }
    // Een eerder afgebroken inschrijving opruimen (anders botst de naam).
    for (const f of factors.filter((x) => x.status === "unverified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: FRIENDLY_NAME, issuer: ISSUER });
    if (error || !data || data.type !== "totp") {
      throw new AppError("configuratie", "Twee-stapsverificatie kon niet worden gestart. Controleer of MFA (TOTP) in Supabase aan staat.");
    }
    return { factorId: data.id, qrCode: qrCodeDataUrl(data.totp.qr_code), secret: data.totp.secret };
  });
}

/** Stap 2: eerste code bevestigen; de sessie wordt daarmee aal2. */
export async function confirmMfaEnrollment(input: { factorId: string; code: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession();
    const id = factorId.safeParse(input?.factorId);
    const code = normalizeTotpCode(input?.code);
    if (!id.success) throw new AppError("ongeldige_invoer", "Ongeldige factor. Begin opnieuw.");
    if (!code) throw new AppError("ongeldige_invoer", "Vul de 6-cijferige code uit uw authenticator-app in.");
    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id.data, code });
    if (error) {
      if (error.status === 429) throw new AppError("limiet_bereikt", "Te veel pogingen. Wacht even en probeer het opnieuw.");
      throw new AppError("ongeldige_invoer", "De code is onjuist of verlopen. Probeer het opnieuw met een nieuwe code.");
    }
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** Afgebroken inschrijving opruimen (alleen niet-geverifieerde factoren). */
export async function cancelMfaEnrollment(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireSession();
    const parsed = factorId.safeParse(id);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige factor.");
    const { supabase, factors } = await listOwnFactors();
    const factor = factors.find((f) => f.id === parsed.data && f.status === "unverified");
    if (factor) await supabase.auth.mfa.unenroll({ factorId: factor.id });
    return undefined;
  });
}

/** Geverifieerde factor verwijderen; alleen vanuit een aal2-sessie. */
export async function removeMfaFactor(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    if (session.mfa.currentLevel !== "aal2") {
      throw new AppError("geen_toegang", "Log opnieuw in met uw verificatiecode om twee-stapsverificatie uit te schakelen.");
    }
    const parsed = factorId.safeParse(id);
    if (!parsed.success) throw new AppError("ongeldige_invoer", "Ongeldige factor.");
    const { supabase, factors } = await listOwnFactors();
    const factor = factors.find((f) => f.id === parsed.data);
    if (!factor) throw new AppError("niet_gevonden", "Deze authenticator-app is niet (meer) gekoppeld.");
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) throw new AppError("onbekend", "Twee-stapsverificatie kon niet worden uitgeschakeld. Probeer het opnieuw.");
    revalidatePath("/", "layout");
    return undefined;
  });
}
