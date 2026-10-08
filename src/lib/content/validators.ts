import type { Channel, IssueSeverity, Language } from "@/lib/db-types";
import { htmlToPlainText, wordCount } from "@/lib/content/html";

/**
 * Deterministische eindcontrole (opdracht §8 stap 9). Deze controles zijn
 * reproduceerbaar en kosten geen AI-tokens; ze vullen de AI-review aan.
 */

export type Finding = {
  severity: IssueSeverity;
  channel: Channel | "algemeen";
  language: Language | "beide";
  category: string;
  description: string;
  source?: string;
};

export const CHANNEL_SPECS: Record<Channel, { minWords: number; maxWords: number; hashtags: [number, number] }> = {
  funda: { minWords: 500, maxWords: 1000, hashtags: [0, 8] },
  website: { minWords: 250, maxWords: 450, hashtags: [0, 8] },
  facebook: { minWords: 80, maxWords: 130, hashtags: [4, 6] },
  instagram: { minWords: 50, maxWords: 100, hashtags: [5, 8] },
};

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+31|0031|\b0)[ -]?(?:\d[ -]?){8,9}\b/g;
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]{2,}/u;
const PRICE_RE = /(€\s?\d|\bvraagprijs\b|\basking price\b|\bk\.k\.\b|\bv\.o\.n\.\b)/i;

export type TextUnderCheck = {
  channel: Channel;
  language: Language;
  html: string;
  hashtags: string[];
};

export type CheckContext = {
  forbiddenPhrases: string[];
  doNotMention: string[];
  allowedContacts: string[];
  priceOnSocial: boolean;
  /** Voor Funda: tekst minus de letterlijk toegevoegde NVM-passages telt mee voor de lengte. */
  closingPassages?: string[];
};

function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "iu");
}

export function checkText(t: TextUnderCheck, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  const plain = htmlToPlainText(t.html);
  const spec = CHANNEL_SPECS[t.channel];
  const words = wordCount(plain);
  const base = { channel: t.channel, language: t.language } as const;

  if (words < spec.minWords) {
    findings.push({ ...base, severity: t.channel === "funda" ? "info" : "waarschuwing", category: "lengte", description: `Tekst telt ${words} woorden; richtlijn is ${spec.minWords}–${spec.maxWords}.` });
  } else if (words > spec.maxWords * (t.channel === "funda" ? 1.5 : 1.15)) {
    findings.push({ ...base, severity: "waarschuwing", category: "lengte", description: `Tekst telt ${words} woorden; richtlijn is ${spec.minWords}–${spec.maxWords}.` });
  }

  if (EMOJI_RE.test(plain)) {
    findings.push({ ...base, severity: "kritiek", category: "stijl", description: "De tekst bevat emoji's; die zijn niet toegestaan." });
  }

  for (const phrase of ctx.forbiddenPhrases) {
    if (phraseRegex(phrase).test(plain)) {
      findings.push({ ...base, severity: "waarschuwing", category: "stijl", description: `Vermijd de formulering "${phrase}" (schrijfwijzer).`, source: phrase });
    }
  }

  for (const subject of ctx.doNotMention) {
    const s = subject.trim();
    if (s.length >= 3 && phraseRegex(s).test(plain)) {
      findings.push({ ...base, severity: "kritiek", category: "niet_noemen", description: `De tekst noemt "${s}", dat volgens het woningprofiel niet genoemd mag worden.`, source: s });
    }
  }

  if (t.channel === "funda" && HASHTAG_RE.test(plain)) {
    findings.push({ ...base, severity: "waarschuwing", category: "stijl", description: "De Funda-tekst bevat hashtags; die horen niet in de hoofdtekst." });
  }

  const allowed = ctx.allowedContacts.map((c) => c.replace(/[\s-]/g, "").toLowerCase());
  for (const email of plain.match(EMAIL_RE) ?? []) {
    if (!allowed.includes(email.toLowerCase())) {
      findings.push({ ...base, severity: "kritiek", category: "privacy", description: `Onbekend e-mailadres in de tekst (${email}). Controleer op persoonsgegevens.` });
    }
  }
  for (const phone of plain.match(PHONE_RE) ?? []) {
    if (!allowed.includes(phone.replace(/[\s-]/g, "").toLowerCase())) {
      findings.push({ ...base, severity: "kritiek", category: "privacy", description: `Onbekend telefoonnummer in de tekst (${phone.trim()}). Controleer op persoonsgegevens.` });
    }
  }

  if ((t.channel === "facebook" || t.channel === "instagram") && !ctx.priceOnSocial && PRICE_RE.test(plain)) {
    findings.push({ ...base, severity: "kritiek", category: "publicatie", description: "De prijs wordt genoemd, terwijl prijs op social media is uitgeschakeld." });
  }

  const [minTags, maxTags] = spec.hashtags;
  if (t.hashtags.length < minTags || t.hashtags.length > maxTags) {
    findings.push({ ...base, severity: "info", category: "hashtags", description: `${t.hashtags.length} hashtags; richtlijn is ${minTags}–${maxTags}.` });
  }
  if ((t.channel === "facebook" || t.channel === "instagram") && !t.hashtags.some((h) => h.toLowerCase() === "#korffdegidts")) {
    findings.push({ ...base, severity: "info", category: "hashtags", description: "#KorffdeGidts ontbreekt in de hashtagset." });
  }

  return findings;
}

/** Haalt "harde" getallen uit een tekst: bedragen, oppervlakten, jaartallen. Notatie-onafhankelijk. */
export function extractKeyNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/€\s?([\d.,]+)/g)) out.add(`eur:${normalizeAmount(m[1])}`);
  for (const m of text.matchAll(/(\d[\d.,]*)\s?(?:m²|m2|vierkante meter|square met)/gi)) out.add(`m2:${normalizeAmount(m[1])}`);
  for (const m of text.matchAll(/\b(1[5-9]\d{2}|20\d{2})\b/g)) out.add(`jaar:${m[1]}`);
  return out;
}

function normalizeAmount(raw: string): string {
  const digits = raw.replace(/[.,](\d{3})(?=([.,]\d{3})*([.,]\d{1,2})?$)/g, "$1");
  return digits.replace(/[.,]\d{1,2}$/, "").replace(/[.,]/g, "");
}

/** Controleert of NL en EN dezelfde harde getallen noemen. */
export function compareLanguages(channel: Channel, nlHtml: string, enHtml: string): Finding[] {
  const nl = extractKeyNumbers(htmlToPlainText(nlHtml));
  const en = extractKeyNumbers(htmlToPlainText(enHtml));
  const onlyNl = [...nl].filter((x) => !en.has(x));
  const onlyEn = [...en].filter((x) => !nl.has(x));
  const findings: Finding[] = [];
  const fmt = (x: string) => x.replace(/^eur:/, "€ ").replace(/^m2:(.*)/, "$1 m²").replace(/^jaar:/, "");
  if (onlyNl.length) {
    findings.push({ severity: "waarschuwing", channel, language: "beide", category: "consistentie_nl_en", description: `Alleen in de Nederlandse tekst: ${onlyNl.map(fmt).join(", ")}.` });
  }
  if (onlyEn.length) {
    findings.push({ severity: "waarschuwing", channel, language: "beide", category: "consistentie_nl_en", description: `Alleen in de Engelse tekst: ${onlyEn.map(fmt).join(", ")}.` });
  }
  return findings;
}
