import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, toSafeError } from "@/lib/errors";

/**
 * CSRF-bescherming voor JSON-routes: muterende verzoeken moeten van dezelfde
 * origin komen (Origin-header verplicht en gelijk aan de host). Sessiecookies
 * zijn bovendien SameSite=Lax. Server Actions hebben een eigen ingebouwde
 * origin-controle in Next.js.
 */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new AppError("geen_toegang", "Verzoek geweigerd.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("geen_toegang", "Verzoek geweigerd.");
  }
  if (originHost !== host) throw new AppError("geen_toegang", "Verzoek geweigerd.");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new AppError("geen_toegang", "Verzoek geweigerd.");
}

export function errorResponse(err: unknown) {
  const safe = toSafeError(err);
  return NextResponse.json(
    { error: { code: safe.code, message: safe.message, retryable: safe.retryable } },
    { status: safe.status, headers: { "Cache-Control": "no-store" } },
  );
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: NextRequest, schema: S, maxBytes = 200_000): Promise<z.infer<S>> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new AppError("ongeldige_invoer", "Het verzoek is te groot.");
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("ongeldige_invoer", "Het verzoek is te groot.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AppError("ongeldige_invoer", "Ongeldige invoer.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("ongeldige_invoer", parsed.error.issues[0]?.message ?? "Ongeldige invoer.");
  return parsed.data;
}

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,120}$/, "Ongeldige idempotency key");

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
