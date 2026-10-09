import { z } from "zod";

/**
 * Schrijfstijlen per makelaar (tabel writing_styles, bewerkbaar door een
 * administrator onder Schrijfwijzer). Een stijl bepaalt UITSLUITEND toon, ritme,
 * woordkeus en lengte; feitelijke regels, privacy en de vaste Funda-structuur
 * blijven altijd gelden. "schrijfwijzer" betekent: geen extra stijl, de huisstijl.
 */
export const STANDARD_STYLE = "schrijfwijzer" as const;
export const STANDARD_STYLE_LABEL = "Standaard (schrijfwijzer)";

export type WritingStyleRow = {
  id: string;
  organization_id: string;
  name: string;
  label: string;
  description: string;
  instruction: string;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
};

/** Keuze bij generatie: de standaardstijl of het id van een schrijfstijl. */
export const styleChoiceSchema = z.union([z.literal(STANDARD_STYLE), z.uuid()]);
export type StyleChoice = z.infer<typeof styleChoiceSchema>;

/** Prompt-blok voor de gekozen stijl (leeg bij de standaardstijl). */
export function styleBlock(style: Pick<WritingStyleRow, "label" | "instruction"> | null): string {
  if (!style) return "";
  const label = style.label.replace(/["<>]/g, "");
  return `<schrijfstijl naam="${label}">\n${style.instruction}\n</schrijfstijl>`;
}

/** De stijl wordt vastgelegd in content_versions.prompt_version als achtervoegsel ("2026-10-09.1+Wim"). */
export function promptVersionWithStyle(promptVersion: string, style: Pick<WritingStyleRow, "name"> | null): string {
  if (!style) return promptVersion;
  return `${promptVersion}+${style.name.replace(/\+/g, " ")}`.slice(0, 40);
}

export function styleNameFromPromptVersion(promptVersion: string | null | undefined): string | null {
  const i = promptVersion?.indexOf("+") ?? -1;
  return promptVersion && i >= 0 ? promptVersion.slice(i + 1) || null : null;
}
