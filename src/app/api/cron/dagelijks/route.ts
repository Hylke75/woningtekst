import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { appBaseUrl, sendMail } from "@/lib/mail";
import { digestLines, type Digest } from "@/lib/digest";

/**
 * Dagelijkse controle (Vercel Cron, zie vercel.json). Draait zonder gebruikerssessie
 * en leest daarom alleen aantallen via de server-RPC met het servergeheim.
 * Meldt per organisatie aan de administrators: mislukte generaties (24 uur),
 * AI-budget boven 80% en — op de eerste van de maand — dossiers die volgens het
 * bewaarbeleid beoordeeld moeten worden. Er wordt nooit iets automatisch verwijderd.
 */
export const maxDuration = 60;


function authorized(req: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  const env = serverEnv();
  if (!authorized(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Niet toegestaan" }, { status: env.CRON_SECRET ? 401 : 503 });
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("server_admin_digest", { p_secret: env.SERVER_RPC_SECRET });
  if (error) {
    console.error("[cron] samenvatting mislukt", error.code);
    return NextResponse.json({ error: "Samenvatting mislukt" }, { status: 500 });
  }
  const firstOfMonth = new Date().getUTCDate() === 1;
  const base = appBaseUrl(req.nextUrl.origin);
  let mailed = 0;
  for (const org of (data ?? []) as Digest[]) {
    const lines = digestLines(org, firstOfMonth);
    if (!lines.length || !org.admins.length) continue;
    const ok = await sendMail({
      to: org.admins,
      subject: `Woningtekst Studio: ${lines.length === 1 ? "1 aandachtspunt" : `${lines.length} aandachtspunten`}`,
      lines,
      link: { href: `${base}/dashboard`, label: "Dashboard openen" },
    });
    if (ok) mailed++;
  }
  return NextResponse.json({ ok: true, organisaties: (data ?? []).length, gemaild: mailed });
}
