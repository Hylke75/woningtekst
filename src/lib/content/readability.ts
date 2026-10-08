import type { Language } from "@/lib/db-types";

/**
 * Deterministische leesbaarheidsmaat (geen AI). Nederlands: Flesch-Douma;
 * Engels: Flesch Reading Ease. Hoger is makkelijker; 60+ is goed leesbaar voor
 * een breed publiek. Lettergrepen worden benaderd via klinkergroepen.
 */
export type Readability = {
  score: number;
  label: "zeer makkelijk" | "makkelijk" | "goed" | "moeilijk" | "zeer moeilijk";
  sentences: number;
  avgWordsPerSentence: number;
  /** Zinnen boven de lengtegrens (eerste 60 tekens), maximaal 5. */
  longSentences: string[];
};

const LONG_SENTENCE = { nl: 25, en: 28 } as const;

function syllables(word: string, language: Language): number {
  const w = word.toLowerCase().replace(/[^a-zà-ÿ]/g, "");
  if (!w) return 0;
  const groups = w.match(language === "nl" ? /(ij|[aeiouyàáâäèéêëìíîïòóôöùúûü]+)/g : /[aeiouy]+/g)?.length ?? 1;
  // Engels: stomme e aan het eind telt niet.
  const silentE = language === "en" && /[^aeiouy]e$/.test(w) && groups > 1 ? 1 : 0;
  return Math.max(1, groups - silentE);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9"“'‘(])|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s));
}

export function readability(text: string, language: Language): Readability | null {
  const sentences = splitSentences(text);
  const words = text.match(/\p{L}[\p{L}'’-]*/gu) ?? [];
  if (sentences.length === 0 || words.length < 20) return null;
  const wps = words.length / sentences.length;
  const spw = words.reduce((n, w) => n + syllables(w, language), 0) / words.length;
  const raw = language === "nl" ? 206.835 - 0.93 * wps - 77 * spw : 206.835 - 1.015 * wps - 84.6 * spw;
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const label = score >= 80 ? "zeer makkelijk" : score >= 65 ? "makkelijk" : score >= 50 ? "goed" : score >= 30 ? "moeilijk" : "zeer moeilijk";
  const limit = LONG_SENTENCE[language];
  const longSentences = sentences
    .filter((s) => (s.match(/\p{L}[\p{L}'’-]*/gu) ?? []).length > limit)
    .slice(0, 5)
    .map((s) => (s.length > 60 ? `${s.slice(0, 60)}…` : s));
  return { score, label, sentences: sentences.length, avgWordsPerSentence: Math.round(wps * 10) / 10, longSentences };
}
