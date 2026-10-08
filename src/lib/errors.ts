/**
 * Applicatiefouten met een veilige, Nederlandstalige melding voor de gebruiker.
 * Interne details (stacktraces, SQL, API-sleutels) gaan nooit naar de client.
 */
export type ErrorCode =
  | "niet_ingelogd"
  | "geen_toegang"
  | "niet_gevonden"
  | "ongeldige_invoer"
  | "conflict"
  | "versieconflict"
  | "limiet_bereikt"
  | "ai_niet_geconfigureerd"
  | "ai_fout"
  | "ai_timeout"
  | "ai_ongeldig_antwoord"
  | "ai_geweigerd"
  | "bestand_ongeldig"
  | "configuratie"
  | "onbekend";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = statusFor(code),
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function statusFor(code: ErrorCode): number {
  switch (code) {
    case "niet_ingelogd":
      return 401;
    case "geen_toegang":
      return 403;
    case "niet_gevonden":
      return 404;
    case "ongeldige_invoer":
    case "bestand_ongeldig":
      return 400;
    case "conflict":
    case "versieconflict":
      return 409;
    case "limiet_bereikt":
      return 429;
    case "ai_timeout":
      return 504;
    case "ai_niet_geconfigureerd":
    case "configuratie":
      return 503;
    default:
      return 500;
  }
}

const QUOTA_MESSAGES: Record<string, string> = {
  te_veel_verzoeken_per_minuut: "Te veel AI-verzoeken in korte tijd. Probeer het over een minuut opnieuw.",
  daglimiet_gebruiker: "U heeft uw daglimiet voor AI-verzoeken bereikt.",
  daglimiet_kosten: "Het dagbudget voor AI-gebruik van de organisatie is bereikt.",
  maandlimiet_kosten: "Het maandbudget voor AI-gebruik van de organisatie is bereikt.",
  geen_toegang: "U heeft geen toegang tot deze woning.",
  geen_instellingen: "De organisatie-instellingen ontbreken. Neem contact op met een administrator.",
};

export function quotaError(reason: string): AppError {
  return new AppError("limiet_bereikt", QUOTA_MESSAGES[reason] ?? "AI-limiet bereikt.");
}

/** Vertaalt Postgres/PostgREST-fouten naar veilige applicatiefouten. */
export function fromDbError(error: { code?: string; message?: string } | null | undefined): AppError {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return new AppError("geen_toegang", "U heeft geen rechten voor deze actie.");
  }
  if (code === "40001" || /Versieconflict/.test(msg)) {
    return new AppError("versieconflict", "Er is intussen een nieuwere versie opgeslagen. Laad de tekst opnieuw.");
  }
  if (code === "23505") return new AppError("conflict", "Dit item bestaat al.");
  if (code === "P0002" || code === "PGRST116") return new AppError("niet_gevonden", "Niet gevonden.");
  if (code === "23514" || code === "22P02" || code === "23502" || code === "22023") {
    // Eigen Nederlandstalige meldingen uit triggers mogen door; overige constraints generiek.
    const own = /^[A-Z][a-zé ,;:()'-]+$/i.test(msg) && !/violates|constraint|syntax/i.test(msg);
    return new AppError("ongeldige_invoer", own ? msg : "De invoer is ongeldig.");
  }
  if (code === "23503") return new AppError("conflict", own23503(msg));
  return new AppError("onbekend", "Er ging iets mis bij het opslaan. Probeer het opnieuw.");
}

function own23503(msg: string) {
  return /Verwijder eerst/.test(msg) ? msg : "Gekoppelde gegevens verhinderen deze actie.";
}

export function toSafeError(err: unknown): { code: ErrorCode; message: string; status: number; retryable: boolean } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, status: err.status, retryable: err.retryable };
  }
  if (process.env.NODE_ENV !== "test") {
    console.error("[onverwachte fout]", err instanceof Error ? err.name + ": " + err.message : "onbekend");
  }
  return { code: "onbekend", message: "Er ging iets mis. Probeer het opnieuw.", status: 500, retryable: true };
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    const safe = toSafeError(err);
    return { ok: false, error: { code: safe.code, message: safe.message } };
  }
}

function isNextControlFlow(err: unknown) {
  const digest = (err as { digest?: string } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR") || digest === "NEXT_NOT_FOUND");
}
