import type {
  Channel,
  ContentSource,
  ContentStatus,
  DocumentType,
  ExtractionStatus,
  IssueSeverity,
  JobStatus,
  Language,
  ListingStatus,
  SaleCondition,
  VerificationStatus,
  WorkflowStatus,
  Confidence,
} from "@/lib/db-types";

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  in_voorbereiding: "In voorbereiding",
  beschikbaar: "Beschikbaar",
  onder_bod: "Onder bod",
  verkocht_onder_voorbehoud: "Verkocht onder voorbehoud",
  verkocht: "Verkocht",
  ingetrokken: "Ingetrokken",
};

export const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  concept: "Concept",
  in_controle: "In controle",
  goedgekeurd: "Goedgekeurd",
  gearchiveerd: "Gearchiveerd",
};

export const SALE_CONDITION_LABELS: Record<SaleCondition, string> = {
  kosten_koper: "Kosten koper",
  vrij_op_naam: "Vrij op naam",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  funda: "Funda",
  website: "Website",
  facebook: "Facebook",
  instagram: "Instagram",
};

export const LANGUAGE_LABELS: Record<Language, string> = { nl: "Nederlands", en: "Engels" };

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  concept: "Concept",
  ter_controle: "Ter controle",
  goedgekeurd: "Goedgekeurd",
};

export const CONTENT_SOURCE_LABELS: Record<ContentSource, string> = {
  ai_generatie: "AI-generatie",
  ai_herschrijving: "AI-herschrijving",
  handmatig: "Handmatig bewerkt",
  hersteld: "Hersteld",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  originele_omschrijving: "Originele woningomschrijving",
  verkoopdossier: "Verkoopdossier",
  meetrapport: "Meetrapport",
  plattegrond: "Plattegrond",
  foto: "Foto",
  energielabel: "Energielabel",
  vve_document: "VvE-document",
  overig: "Overig document",
};

export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  niet_gestart: "Niet geanalyseerd",
  bezig: "Wordt geanalyseerd",
  voltooid: "Geanalyseerd",
  mislukt: "Analyse mislukt",
  niet_van_toepassing: "Niet van toepassing",
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  onbevestigd: "Onbevestigd",
  bevestigd: "Bevestigd",
  conflict: "Conflict",
  afgewezen: "Afgewezen",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = { hoog: "Hoog", middel: "Middel", laag: "Laag" };

export const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  info: "Info",
  waarschuwing: "Waarschuwing",
  kritiek: "Kritiek",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  wachtrij: "In wachtrij",
  bezig: "Bezig",
  voltooid: "Voltooid",
  mislukt: "Mislukt",
  geannuleerd: "Geannuleerd",
};

export function optionLabel(fieldKey: string, value: string): string {
  if (fieldKey === "listing_status") return LISTING_STATUS_LABELS[value as ListingStatus] ?? value;
  if (fieldKey === "sale_condition") return SALE_CONDITION_LABELS[value as SaleCondition] ?? value;
  return value;
}
