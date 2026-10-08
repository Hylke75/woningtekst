export type Digest = {
  organisatie: string;
  admins: string[];
  bewaartermijn_kandidaten: number;
  mislukte_generaties_24u: number;
  kosten_maand_eur: number;
  budget_maand_eur: number;
};

/** Aandachtspunten voor de dagelijkse beheerdersmail; leeg = geen mail. */
export function digestLines(org: Digest, firstOfMonth: boolean): string[] {
  const lines: string[] = [];
  if (org.mislukte_generaties_24u > 0) {
    lines.push(`${org.mislukte_generaties_24u} generatie${org.mislukte_generaties_24u === 1 ? " is" : "s zijn"} het afgelopen etmaal mislukt. Bekijk de details op het dashboard.`);
  }
  if (org.budget_maand_eur > 0 && org.kosten_maand_eur >= 0.8 * org.budget_maand_eur) {
    lines.push(`Het AI-budget van deze maand is voor ${Math.round((100 * org.kosten_maand_eur) / org.budget_maand_eur)}% gebruikt (€ ${org.kosten_maand_eur.toFixed(2)} van € ${org.budget_maand_eur.toFixed(2)}).`);
  }
  if (firstOfMonth && org.bewaartermijn_kandidaten > 0) {
    lines.push(`${org.bewaartermijn_kandidaten} dossier${org.bewaartermijn_kandidaten === 1 ? "" : "s"} vallen buiten de bewaartermijn. Beoordeel ze onder Instellingen › Bewaarbeleid; er wordt niets automatisch verwijderd.`);
  }
  return lines;
}
