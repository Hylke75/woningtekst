import type { Instrumentation } from "next";

/** Per serverinstantie: dezelfde fout hooguit één keer per 10 minuten naar de webhook. */
const recent = new Map<string, number>();

/**
 * Centrale registratie van serverfouten. Logt gestructureerd (zichtbaar in de
 * Vercel-logs, zonder headers, querystring of inhoud) en meldt optioneel aan een
 * webhook (ALERT_WEBHOOK_URL, bijv. Slack of Teams) zodat fouten niet onopgemerkt blijven.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const name = err instanceof Error ? err.name : "Error";
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  const path = request.path.split("?")[0];
  const entry = { niveau: "fout", type: name, digest, pad: path, methode: request.method, route: context.routePath, soort: context.routeType };
  console.error(JSON.stringify(entry));

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook || !/^https:\/\//.test(webhook)) return;
  const key = `${context.routePath}:${name}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 10 * 60_000) return;
  recent.set(key, now);
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Woningtekst Studio (${process.env.VERCEL_ENV ?? "lokaal"}): ${name} in ${context.routePath} (${request.method} ${path})${digest ? `, digest ${digest}` : ""}` }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Melden is best effort.
  }
};
