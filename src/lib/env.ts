import "server-only";
import { z } from "zod";

/**
 * Server-side configuratie. Wordt bij eerste gebruik gevalideerd; ontbrekende
 * waarden leveren een duidelijke fout op zonder geheimen te tonen.
 * Geheimen staan NOOIT in NEXT_PUBLIC_-variabelen.
 */
const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  SERVER_RPC_SECRET: z.string().min(32, "SERVER_RPC_SECRET moet minimaal 32 tekens bevatten"),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  ANTHROPIC_MODEL: z.string().min(3).default("claude-opus-5-5"),
  ANTHROPIC_EXTRACTION_MODEL: z.string().min(3).optional(),
  /** Lichter model voor SEO/hashtags en korte social-teksten (hergenereren/herschrijven). */
  ANTHROPIC_LIGHT_MODEL: z.string().min(3).default("claude-sonnet-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  ANTHROPIC_FALLBACKS: z.enum(["default", "off"]).default("default"),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(800_000).default(240_000),
  AI_USD_TO_EUR: z.coerce.number().positive().default(0.92),
  AI_MOCK: boolish,
  UPLOAD_MAX_FILE_MB: z.coerce.number().int().min(1).max(25).default(20),
  UPLOAD_MAX_FILES_PER_PROPERTY: z.coerce.number().int().min(1).max(200).default(40),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),
  VERCEL_ENV: z.string().optional(),
  /** Moet "true" zijn in Preview-deployments: bevestigt dat Preview een eigen (test)database gebruikt. */
  PREVIEW_DATABASE_ISOLATED: boolish,
  /** Optioneel: e-mail via Resend (meldingen). Zonder sleutel worden meldingen alleen in de app getoond. */
  RESEND_API_KEY: z.string().min(10).optional(),
  MAIL_FROM: z.string().min(3).optional(),
  /** Optioneel: geheim voor Vercel Cron (Authorization: Bearer …). */
  CRON_SECRET: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  // Lege waarden (bijv. "ANTHROPIC_API_KEY=" in .env) gelden als niet ingesteld.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Ongeldige of ontbrekende serverconfiguratie: ${fields}`);
  }
  if (parsed.data.AI_MOCK && parsed.data.VERCEL_ENV === "production") {
    throw new Error("AI_MOCK mag niet actief zijn in productie");
  }
  // Previews mogen nooit op de productiedatabase draaien: alleen met expliciete bevestiging
  // dat de Preview-omgeving een eigen testproject gebruikt.
  if (parsed.data.VERCEL_ENV === "preview" && !parsed.data.PREVIEW_DATABASE_ISOLATED) {
    throw new Error("Preview-omgeving zonder eigen testdatabase: zet PREVIEW_DATABASE_ISOLATED=true na koppeling van een testproject");
  }
  cached = parsed.data;
  return cached;
}

export function aiConfigured(): boolean {
  const env = serverEnv();
  return env.AI_MOCK || Boolean(env.ANTHROPIC_API_KEY);
}
