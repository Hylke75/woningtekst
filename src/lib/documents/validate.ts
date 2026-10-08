import { fileTypeFromBuffer } from "file-type";

/**
 * Toegestane bestandstypen. Zowel de opgegeven MIME-type als de WERKELIJKE
 * inhoud (magic bytes) moeten overeenkomen; extensies alleen zijn niet genoeg.
 */
export const ALLOWED_TYPES = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", label: "Word (DOCX)" },
  "text/plain": { ext: "txt", label: "Tekst (TXT)" },
  "image/jpeg": { ext: "jpg", label: "JPG" },
  "image/png": { ext: "png", label: "PNG" },
  "image/webp": { ext: "webp", label: "WEBP" },
} as const;

export type AllowedMime = keyof typeof ALLOWED_TYPES;

export function isAllowedMime(mime: string): mime is AllowedMime {
  return Object.hasOwn(ALLOWED_TYPES, mime);
}

export const ACCEPT_ATTRIBUTE = ".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp";

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "bestand";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "bestand").slice(0, 200);
}

export type ContentCheck = { ok: true; mime: AllowedMime } | { ok: false; reason: string };

/** Controleert de werkelijke inhoud van een bestand. */
export async function detectContent(buffer: Uint8Array, declaredMime: string): Promise<ContentCheck> {
  if (!isAllowedMime(declaredMime)) return { ok: false, reason: "Dit bestandstype wordt niet ondersteund." };
  if (buffer.byteLength === 0) return { ok: false, reason: "Het bestand is leeg." };

  if (declaredMime === "text/plain") {
    if (buffer.includes(0)) return { ok: false, reason: "Het tekstbestand bevat binaire gegevens." };
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      // Oudere Windows-bestanden: accepteer Latin-1 zonder controletekens.
      if (buffer.some((b) => b < 9 || (b > 13 && b < 32))) return { ok: false, reason: "Het tekstbestand heeft een onbekende codering." };
    }
    return { ok: true, mime: "text/plain" };
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) return { ok: false, reason: "Het bestandstype kon niet worden vastgesteld." };
  if (detected.mime !== declaredMime) {
    return { ok: false, reason: `De inhoud van het bestand (${detected.ext}) komt niet overeen met het opgegeven type.` };
  }
  return { ok: true, mime: declaredMime };
}

export function decodeText(buffer: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("latin1").decode(buffer);
  }
}
