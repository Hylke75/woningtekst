/**
 * Hulpfuncties rond de schrijfwijzer (Markdown met gemarkeerde passages).
 * Passages worden letterlijk overgenomen, nooit door AI herschreven.
 */
export type Passages = Record<string, string>;

const PASSAGE_RE = /<!--\s*passage:([a-z0-9_]+)\s*-->([\s\S]*?)<!--\s*\/passage\s*-->/g;

export function parsePassages(markdown: string): Passages {
  const out: Passages = {};
  for (const m of markdown.matchAll(PASSAGE_RE)) out[m[1]] = m[2].trim();
  return out;
}

/** Schrijfwijzer zonder passageblokken (die gaan niet naar het model). */
export function guideForPrompt(markdown: string): string {
  return markdown.replace(PASSAGE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Verboden formuleringen uit de sectie "Te vermijden". */
export function forbiddenPhrases(markdown: string): string[] {
  const section = markdown.split(/^##\s+/m).find((s) => /^\d*\.?\s*Te vermijden/i.test(s));
  if (!section) return [];
  return section
    .split("\n")
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, "").replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase())
    .filter((l) => l.length >= 4 && l.length <= 60 && !l.includes(":"));
}

const CLAUSES: { key: string; pattern: RegExp }[] = [
  { key: "clausule_ouderdom", pattern: /ouderdom/i },
  { key: "clausule_asbest", pattern: /asbest/i },
  { key: "clausule_niet_zelfbewoning", pattern: /niet[- ]?zelfbewoning/i },
  { key: "clausule_meetinstructie", pattern: /meetinstructie|nen\s*2580/i },
];

/** Bepaalt welke NVM-passages bij deze woning horen (alleen op basis van aangeleverde gegevens). */
export function closingPassages(passages: Passages, language: "nl" | "en", verkoopclausules: string | null | undefined): string[] {
  const result: string[] = [];
  for (const c of CLAUSES) {
    if (verkoopclausules && c.pattern.test(verkoopclausules)) {
      const text = passages[`${c.key}_${language}`];
      if (text) result.push(text);
    }
  }
  const closing = passages[`nvm_afsluiting_${language}`];
  if (closing) result.push(closing);
  return result;
}
