/**
 * Rijtypen die overeenkomen met supabase/migrations. Bij een gekoppeld
 * Supabase-project kunnen deze worden vervangen door gegenereerde typen
 * (zie DATABASE.md). Alle externe data wordt bovendien met Zod gevalideerd.
 */
import type { AppRole } from "@/lib/auth/permissions";

export type WorkflowStatus = "concept" | "in_controle" | "goedgekeurd" | "gearchiveerd";
export type ListingStatus =
  | "in_voorbereiding"
  | "beschikbaar"
  | "onder_bod"
  | "verkocht_onder_voorbehoud"
  | "verkocht"
  | "ingetrokken";
export type SaleCondition = "kosten_koper" | "vrij_op_naam";
export type Channel = "funda" | "website" | "facebook" | "instagram";
export type Language = "nl" | "en";
export type ContentStatus = "concept" | "ter_controle" | "goedgekeurd";
export type ContentSource = "ai_generatie" | "ai_herschrijving" | "handmatig" | "hersteld";
export type JobType =
  | "volledige_generatie"
  | "enkele_hergeneratie"
  | "herschrijving"
  | "tekstcontrole"
  | "extractie"
  | "schrijfwijzer_analyse";
export type JobStatus = "wachtrij" | "bezig" | "voltooid" | "mislukt" | "geannuleerd";
export type DocumentType =
  | "originele_omschrijving"
  | "verkoopdossier"
  | "meetrapport"
  | "plattegrond"
  | "foto"
  | "energielabel"
  | "vve_document"
  | "overig";
export type ExtractionStatus = "niet_gestart" | "bezig" | "voltooid" | "mislukt" | "niet_van_toepassing";
export type VerificationStatus = "onbevestigd" | "bevestigd" | "conflict" | "afgewezen";
export type Confidence = "hoog" | "middel" | "laag";
export type IssueSeverity = "info" | "waarschuwing" | "kritiek";

export type PropertyRow = {
  writing_style_id?: string | null;
  id: string;
  organization_id: string;
  created_by: string | null;
  assigned_to: string | null;
  address: string | null;
  house_number: string | null;
  addition: string | null;
  postcode: string | null;
  city: string | null;
  neighbourhood: string | null;
  property_type: string | null;
  listing_status: ListingStatus;
  asking_price: number | null;
  sale_condition: SaleCondition | null;
  living_area: number | null;
  plot_area: number | null;
  year_built: number | null;
  energy_label: string | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  toilets: number | null;
  floors: number | null;
  floor_position: string | null;
  facts_json: Record<string, unknown>;
  positioning_json: Record<string, unknown>;
  publication_json: Record<string, unknown>;
  workflow_status: WorkflowStatus;
  data_checked_at: string | null;
  data_checked_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
};

export type PropertyOverviewRow = Pick<
  PropertyRow,
  | "id"
  | "organization_id"
  | "address"
  | "house_number"
  | "addition"
  | "postcode"
  | "city"
  | "neighbourhood"
  | "property_type"
  | "listing_status"
  | "workflow_status"
  | "asking_price"
  | "assigned_to"
  | "created_by"
  | "created_at"
  | "updated_at"
  | "deleted_at"
> & {
  assigned_to_name: string | null;
  text_count: number;
  approved_count: number;
  review_count: number;
  open_issue_count: number;
  last_activity_at: string;
};

export type DocumentRow = {
  id: string;
  property_id: string;
  organization_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  file_size: number;
  document_type: DocumentType;
  sha256: string;
  uploaded_by: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  page_count: number | null;
  alt_text_nl?: string | null;
  alt_text_en?: string | null;
  created_at: string;
};

export type FactRow = {
  id: string;
  property_id: string;
  organization_id: string;
  field_name: string;
  field_value: string;
  source_type: "document" | "geplakte_tekst" | "handmatig";
  source_document_id: string | null;
  source_reference: string | null;
  source_quote: string | null;
  confidence: Confidence;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  extraction_job_id: string | null;
  created_at: string;
};

export type ContentVersionRow = {
  id: string;
  property_id: string;
  organization_id: string;
  channel: Channel;
  language: Language;
  version_number: number;
  content: string;
  status: ContentStatus;
  source: ContentSource;
  seo_title: string | null;
  meta_description: string | null;
  slug: string | null;
  hashtags: string[];
  prompt_version: string | null;
  style_guide_id: string | null;
  style_guide_version: number | null;
  generation_job_id: string | null;
  based_on_version_id: string | null;
  generated_by: string | null;
  edited_by: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type JobRow = {
  id: string;
  property_id: string | null;
  organization_id: string;
  requested_by: string | null;
  job_type: JobType;
  status: JobStatus;
  idempotency_key: string;
  params: Record<string, unknown>;
  steps: Record<string, unknown>;
  current_step: string | null;
  attempt_count: number;
  input_hash: string;
  style_guide_id: string | null;
  model: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
  token_usage: { input_tokens: number; output_tokens: number };
  estimated_cost: number;
  created_at: string;
};

export type StyleGuideRow = {
  id: string;
  organization_id: string;
  version: number;
  title: string;
  content: string;
  change_note: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type ReviewIssueRow = {
  id: string;
  property_id: string;
  organization_id: string;
  content_version_id: string | null;
  generation_job_id: string | null;
  severity: IssueSeverity;
  category: string;
  field_name: string | null;
  description: string;
  source_details: string | null;
  resolution_status: "open" | "opgelost" | "genegeerd";
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type OrganizationSettingsRow = {
  organization_id: string;
  ai_daily_cost_limit_eur: number;
  ai_monthly_cost_limit_eur: number;
  ai_requests_per_minute_per_user: number;
  ai_daily_requests_per_user: number;
  approval_roles: AppRole[];
  retention_months_after_sale: number;
  retention_months_inactive_concept: number;
  updated_at: string;
};

export type MembershipRow = {
  organization_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
};
