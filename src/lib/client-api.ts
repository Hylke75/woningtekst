"use client";

export type ApiError = { code: string; message: string; retryable?: boolean };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; status: number };

/** JSON-aanroep naar eigen API-routes (zelfde origin, cookies mee). */
export async function api<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: json?.error ?? { code: "onbekend", message: res.status === 504 ? "De server reageerde niet op tijd. Probeer het opnieuw." : "Er ging iets mis. Probeer het opnieuw.", retryable: true },
      };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return { ok: false, status: 0, error: { code: "afgebroken", message: "Afgebroken." } };
    return { ok: false, status: 0, error: { code: "netwerk", message: "Geen verbinding met de server. Controleer uw internetverbinding.", retryable: true } };
  }
}

export function newIdempotencyKey(prefix = "k"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
