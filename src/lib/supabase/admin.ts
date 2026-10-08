import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Optionele beheerclient met de Supabase secret key. Wordt UITSLUITEND gebruikt
 * om uitnodigingsmails te versturen via Supabase Auth. Zonder SUPABASE_SECRET_KEY
 * werkt de applicatie volledig; uitgenodigde gebruikers registreren zich dan zelf
 * via /registreren met het uitgenodigde e-mailadres.
 */
export function createAdminClient() {
  const env = serverEnv();
  if (!env.SUPABASE_SECRET_KEY) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
