import sanitize from "sanitize-html";
import type { FundaText } from "@/lib/ai/schemas";

/** Toegestane opmaak in teksten. Alles daarbuiten wordt verwijderd (XSS-bescherming). */
const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: ["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "br"],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: false,
};

export function sanitizeContentHtml(html: string): string {
  return sanitize(html, SANITIZE_OPTIONS).trim();
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const p = (t: string) => `<p>${escapeHtml(t.trim())}</p>`;

export const FUNDA_HEADINGS = {
  nl: {
    locatie: "Locatie",
    kenmerken: (adres: string) => `Wat je graag wilt weten over ${adres}`,
    indeling: "Indeling",
    kadastraal: "Kadastrale informatie",
    oplevering: "Oplevering",
  },
  en: {
    locatie: "Location",
    kenmerken: (adres: string) => `What you'd like to know about ${adres}`,
    indeling: "Layout",
    kadastraal: "Cadastral information",
    oplevering: "Delivery",
  },
} as const;

export function fundaToHtml(f: FundaText, language: "nl" | "en", streetAddress: string, closing: string[]): string {
  const h = FUNDA_HEADINGS[language];
  const parts: string[] = [];
  parts.push(...f.introductie.map(p));
  parts.push(`<h2>${escapeHtml(h.locatie)}</h2>`, ...f.locatie.map(p));
  parts.push(`<h2>${escapeHtml(h.kenmerken(streetAddress))}</h2>`);
  parts.push(`<ul>${f.kenmerken.map((k) => `<li>${escapeHtml(k.trim())}</li>`).join("")}</ul>`);
  parts.push(`<h2>${escapeHtml(h.indeling)}</h2>`);
  for (const v of f.indeling) parts.push(`<h3>${escapeHtml(v.verdieping.trim())}</h3>`, p(v.tekst));
  if (f.kadastraal.length) parts.push(`<h2>${escapeHtml(h.kadastraal)}</h2>`, ...f.kadastraal.map(p));
  if (f.oplevering.length) parts.push(`<h2>${escapeHtml(h.oplevering)}</h2>`, ...f.oplevering.map(p));
  if (closing.length) parts.push(...closing.map(p));
  return sanitizeContentHtml(parts.join("\n"));
}

export function websiteToHtml(w: { titel: string; alineas: string[] }): string {
  return sanitizeContentHtml([`<h2>${escapeHtml(w.titel.trim())}</h2>`, ...w.alineas.map(p)].join("\n"));
}

export function plainToHtml(text: string): string {
  return sanitizeContentHtml(
    text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p>${block.split("\n").map(escapeHtml).join("<br>")}</p>`)
      .join("\n"),
  );
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Platte tekst voor kopiëren naar Funda/social en voor tellingen. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|h2|h3|li|ul|ol)>/gi, "\n")
    .replace(/<(h2|h3)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,-]*/gu) ?? []).length;
}

/** Normaliseert hashtags: #-prefix, geen spaties of leestekens, uniek. */
export function normalizeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const clean = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${clean}`);
  }
  return out;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}
