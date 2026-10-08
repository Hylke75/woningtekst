import "server-only";
import { after, type NextRequest } from "next/server";
import type { ServerSupabase } from "@/lib/supabase/server";
import { runNextGenerationStep } from "@/lib/pipeline/generation";
import { getJob } from "@/lib/pipeline/jobs";

/** Header waarmee de server zichzelf aanroept om een generatie in de achtergrond voort te zetten. */
export const BACKGROUND_HEADER = "x-woningtekst-achtergrond";

/**
 * Een nieuwe stap wordt alleen gestart als er nog ruim tijd over is binnen de
 * maxDuration (300 s) van deze aanroep; een stap kan enkele minuten duren.
 */
const START_BUDGET_MS = 75_000;

/** Alleen doorketenen als het toegangstoken nog minstens zo lang geldig is (geen tokenvernieuwing op de server). */
const MIN_TOKEN_VALIDITY_MS = 10 * 60_000;

/**
 * Zet een volledige generatie na het antwoord voort, ook als de gebruiker het
 * tabblad sluit. Werkt binnen de rechten van de ingelogde gebruiker (RLS): er
 * wordt geen service-role gebruikt. Stappen die niet meer in deze aanroep passen,
 * worden in een nieuwe serveraanroep met dezelfde sessie voortgezet.
 * Dubbel werk is uitgesloten door de atomische job-claim in de database.
 */
export function continueGenerationInBackground(req: NextRequest, supabase: ServerSupabase, jobId: string, startedAt: number) {
  after(async () => {
    try {
      let job = await getJob(supabase, jobId);
      while (job.status === "wachtrij" && Date.now() - startedAt < START_BUDGET_MS) {
        job = await runNextGenerationStep(supabase, jobId);
      }
      if (job.status === "wachtrij") await chain(req, supabase, jobId);
    } catch (err) {
      // De job blijft hervatbaar; de volgende aanroep (browser of keten) pakt hem op.
      console.error("[generatie] achtergrondverwerking onderbroken", err instanceof Error ? err.name : "onbekend");
    }
  });
}

async function chain(req: NextRequest, supabase: ServerSupabase, jobId: string) {
  const cookie = req.headers.get("cookie");
  if (!cookie) return;
  const { data } = await supabase.auth.getClaims();
  const expiresAt = Number(data?.claims?.exp ?? 0) * 1000;
  if (expiresAt - Date.now() < MIN_TOKEN_VALIDITY_MS) return; // hervat bij het volgende bezoek
  const origin = req.nextUrl.origin;
  try {
    await fetch(new URL(`/api/jobs/${jobId}/verder`, origin), {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json", [BACKGROUND_HEADER]: "1" },
      body: "{}",
      cache: "no-store",
      // De aangeroepen route antwoordt direct en werkt daarna zelf verder.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // Niet erg: de browser of een volgend bezoek hervat de job.
  }
}
