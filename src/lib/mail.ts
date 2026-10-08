import "server-only";
import { serverEnv } from "@/lib/env";
import { escapeHtml } from "@/lib/content/html";

export type MailMessage = { to: string[]; subject: string; lines: string[]; link?: { href: string; label: string } };

/** Of uitgaande meldingen per e-mail geconfigureerd zijn (Resend). */
export function mailConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

/**
 * Verstuurt een eenvoudige, tekstuele melding via de Resend-API. Bevat bewust
 * geen woninginhoud of persoonsgegevens van derden; alleen een korte omschrijving
 * en een link naar de applicatie (waar RLS de toegang bepaalt).
 * Zonder configuratie: no-op (meldingen staan dan alleen in de app).
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const env = serverEnv();
  const to = [...new Set(msg.to.map((t) => t.trim().toLowerCase()).filter((t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)))];
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || to.length === 0) return false;
  const html = [
    ...msg.lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`),
    msg.link ? `<p><a href="${escapeHtml(msg.link.href)}" style="color:#193D4B;font-weight:600">${escapeHtml(msg.link.label)}</a></p>` : "",
    `<p style="margin-top:24px;color:#667078;font-size:12px">Woningtekst Studio · Korff de Gidts NVM Makelaardij</p>`,
  ].join("");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to,
        subject: msg.subject.slice(0, 200),
        html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#252A2E">${html}</div>`,
        text: [...msg.lines, msg.link ? `${msg.link.label}: ${msg.link.href}` : ""].join("\n\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[mail] verzenden mislukt", res.status);
    return res.ok;
  } catch {
    console.error("[mail] verzenden mislukt (netwerk)");
    return false;
  }
}

export function appBaseUrl(fallbackOrigin: string): string {
  return (serverEnv().NEXT_PUBLIC_APP_URL ?? fallbackOrigin).replace(/\/$/, "");
}
