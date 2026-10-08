import "server-only";
import { AppError } from "@/lib/errors";
import { decodeText, type AllowedMime } from "@/lib/documents/validate";

/** Maximale hoeveelheid tekst per bron die naar Claude gaat. Langer wordt expliciet gemeld, nooit stil afgekapt. */
export const MAX_SOURCE_CHARS = 180_000;

export type ExtractedSource =
  | { kind: "text"; text: string; pageCount: number | null; truncated: boolean }
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export async function extractSource(buffer: Uint8Array, mime: AllowedMime): Promise<ExtractedSource> {
  switch (mime) {
    case "application/pdf": {
      const { extractText, getDocumentProxy } = await import("unpdf");
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { totalPages, text } = await extractText(pdf, { mergePages: false });
        const joined = text.map((t, i) => `[pagina ${i + 1}]\n${t.trim()}`).join("\n\n");
        if (joined.replace(/\[pagina \d+\]/g, "").trim().length < 20) {
          throw new AppError("bestand_ongeldig", "Deze PDF bevat geen leesbare tekst (mogelijk een scan). Upload de pagina's als afbeelding of plak de tekst.");
        }
        return { kind: "text", ...limit(joined), pageCount: totalPages };
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError("bestand_ongeldig", "De PDF kon niet worden gelezen. Mogelijk is het bestand beschadigd of beveiligd.");
      }
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      try {
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
        return { kind: "text", ...limit(value), pageCount: null };
      } catch {
        throw new AppError("bestand_ongeldig", "Het Word-document kon niet worden gelezen.");
      }
    }
    case "text/plain":
      return { kind: "text", ...limit(decodeText(buffer)), pageCount: null };
    default:
      return { kind: "image", mediaType: mime, base64: Buffer.from(buffer).toString("base64") };
  }
}

function limit(text: string) {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  return clean.length > MAX_SOURCE_CHARS ? { text: clean.slice(0, MAX_SOURCE_CHARS), truncated: true } : { text: clean, truncated: false };
}
