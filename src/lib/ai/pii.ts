/**
 * Maskeert niet-relevante persoonsgegevens voordat documenttekst naar Claude
 * gaat (dataminimalisatie, AVG art. 5 lid 1c). Woninggegevens (adres van de
 * woning, oppervlakten, prijzen, jaartallen) blijven intact.
 *
 * Dit is een best-effort filter; het vervangt geen menselijke beoordeling. De
 * eindcontrole controleert de gegenereerde teksten daarnaast op e-mailadressen
 * en telefoonnummers.
 */

export type MaskResult = { text: string; counts: Record<string, number> };

const LABELLED_PERSON =
  /^(\s*(?:verkoper|verkopers|verkoopster|koper|kopers|eigenaar|eigenaren|eigena(?:a|ren)|huurder|huurders|bewoner|bewoners|opdrachtgever|naam|contactpersoon verkoper|erfgenamen|de heer|mevrouw|dhr\.?|mevr\.?)\s*[:\-–]\s*)(.+)$/gim;
const TITLE_NAME = /\b(de heer|mevrouw|dhr\.|mevr\.|mr\.|mrs\.|ms\.|mw\.)\s+(?:[A-Z]\.?\s*){0,3}[A-Z][a-zà-ÿ'-]+(?:\s+(?:van|de|der|den|ter|ten|het|'t)\b)*(?:\s+[A-Z][a-zà-ÿ'-]+)?/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IBAN = /\b[A-Z]{2}\d{2}\s?(?:[A-Z0-9]{4}\s?){2,7}[A-Z0-9]{1,4}\b/g;
const PHONE = /(?:\+31|0031|\b0)[\s-]?(?:\d[\s-]?){8,9}\b/g;
const BIRTH = /\b(geboren(?:\s+op)?|geboortedatum|geb\.)\s*[:]?\s*\d{1,2}[-/ .](?:\d{1,2}|[a-z]+)[-/ .]\d{2,4}/gi;
const NINE_DIGITS = /\b\d{9}\b/g;

function isBsn(candidate: string): boolean {
  if (!/^\d{9}$/.test(candidate)) return false;
  const d = candidate.split("").map(Number);
  const sum = d.slice(0, 8).reduce((acc, n, i) => acc + n * (9 - i), 0) - d[8];
  return sum % 11 === 0 && sum !== 0;
}

export function maskPersonalData(input: string, keep: string[] = []): MaskResult {
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const keepLower = keep.map((k) => k.toLowerCase().replace(/[\s-]/g, ""));
  const shouldKeep = (v: string) => keepLower.includes(v.toLowerCase().replace(/[\s-]/g, ""));

  let text = input.replace(/\r\n/g, "\n");
  text = text.replace(LABELLED_PERSON, (_m, label: string) => {
    bump("naam");
    return `${label}[naam verwijderd]`;
  });
  text = text.replace(TITLE_NAME, () => {
    bump("naam");
    return "[naam verwijderd]";
  });
  text = text.replace(EMAIL, (m) => (shouldKeep(m) ? m : (bump("e-mail"), "[e-mailadres verwijderd]")));
  text = text.replace(IBAN, () => (bump("iban"), "[rekeningnummer verwijderd]"));
  text = text.replace(BIRTH, () => (bump("geboortedatum"), "[geboortedatum verwijderd]"));
  text = text.replace(NINE_DIGITS, (m) => (isBsn(m) ? (bump("bsn"), "[BSN verwijderd]") : m));
  text = text.replace(PHONE, (m) => (shouldKeep(m) ? m : (bump("telefoon"), "[telefoonnummer verwijderd]")));
  return { text, counts };
}
