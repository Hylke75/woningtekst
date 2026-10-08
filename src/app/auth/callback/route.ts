import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Verwerkt links uit e-mails (bevestiging, uitnodiging, wachtwoordherstel).
 * Ondersteunt zowel de PKCE-code als token_hash-links.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  let next = safeNextPath(searchParams.get("volgende") ?? searchParams.get("next"));

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    if (ok && (type === "recovery" || type === "invite")) next = "/wachtwoord-instellen";
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/inloggen?melding=link-ongeldig", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
