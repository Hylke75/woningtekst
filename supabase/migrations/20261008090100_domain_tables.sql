-- Migratie 2: domeintabellen (woningen, documenten, feiten, teksten, jobs, schrijfwijzer, controles, audit).

-- ---------------------------------------------------------------------------
-- Schrijfwijzer (versiebeheer)
-- ---------------------------------------------------------------------------
create table public.style_guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version integer not null check (version > 0),
  title text not null default 'Schrijfwijzer' check (char_length(title) <= 200),
  content text not null check (char_length(content) between 50 and 200000),
  change_note text not null default '' check (char_length(change_note) <= 2000),
  is_active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, version),
  unique (id, organization_id)
);
create unique index style_guides_one_active_idx on public.style_guides (organization_id) where is_active;

-- ---------------------------------------------------------------------------
-- Woningen
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  assigned_to uuid references auth.users (id) on delete set null,

  -- Sectie 1: basisgegevens (adres mag leeg zijn zolang de woning concept is)
  address text check (char_length(address) <= 200),
  house_number text check (char_length(house_number) <= 20),
  addition text check (char_length(addition) <= 20),
  postcode text check (postcode is null or postcode ~ '^[1-9][0-9]{3} ?[A-Za-z]{2}$'),
  city text check (char_length(city) <= 120),
  neighbourhood text check (char_length(neighbourhood) <= 160),
  property_type text check (char_length(property_type) <= 120),
  listing_status public.listing_status not null default 'in_voorbereiding',
  asking_price integer check (asking_price is null or asking_price between 0 and 1000000000),
  sale_condition public.sale_condition,
  living_area integer check (living_area is null or living_area between 1 and 100000),
  plot_area integer check (plot_area is null or plot_area between 0 and 10000000),
  year_built integer check (year_built is null or year_built between 1000 and 2100),
  energy_label text check (energy_label is null or energy_label in ('A+++++','A++++','A+++','A++','A+','A','B','C','D','E','F','G','Onbekend','Niet verplicht')),
  rooms smallint check (rooms is null or rooms between 0 and 200),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 200),
  bathrooms smallint check (bathrooms is null or bathrooms between 0 and 100),
  toilets smallint check (toilets is null or toilets between 0 and 100),
  floors smallint check (floors is null or floors between 0 and 100),
  floor_position text check (char_length(floor_position) <= 120),

  -- Secties 2 t/m 6 als gevalideerde JSON-documenten (schema wordt in de applicatie met Zod afgedwongen)
  facts_json jsonb not null default '{}'::jsonb check (jsonb_typeof(facts_json) = 'object' and pg_column_size(facts_json) < 200000),
  positioning_json jsonb not null default '{}'::jsonb check (jsonb_typeof(positioning_json) = 'object' and pg_column_size(positioning_json) < 100000),
  publication_json jsonb not null default '{}'::jsonb check (jsonb_typeof(publication_json) = 'object' and pg_column_size(publication_json) < 50000),

  workflow_status public.workflow_status not null default 'concept',
  data_checked_at timestamptz,
  data_checked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  unique (id, organization_id)
);
create index properties_org_updated_idx on public.properties (organization_id, updated_at desc) where deleted_at is null;
create index properties_org_workflow_idx on public.properties (organization_id, workflow_status) where deleted_at is null;
create index properties_assigned_idx on public.properties (assigned_to);
create index properties_created_by_idx on public.properties (created_by);
create index properties_search_idx on public.properties
  using gin ((coalesce(address, '') || ' ' || coalesce(house_number, '') || ' ' || coalesce(city, '') || ' ' || coalesce(neighbourhood, '') || ' ' || coalesce(postcode, '')) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Documenten
-- ---------------------------------------------------------------------------
create table public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  organization_id uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 600),
  filename text not null check (char_length(filename) between 1 and 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'image/jpeg', 'image/png', 'image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 52428800),
  document_type public.document_type not null default 'overig',
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid references auth.users (id) on delete set null,
  extraction_status public.extraction_status not null default 'niet_gestart',
  extraction_error text check (char_length(extraction_error) <= 500),
  page_count integer,
  created_at timestamptz not null default now(),
  foreign key (property_id, organization_id) references public.properties (id, organization_id) on delete cascade,
  unique (id, organization_id),
  -- Bestandsnaam moet onder de map van organisatie en woning staan.
  constraint property_documents_path_scope check (storage_path like organization_id::text || '/' || property_id::text || '/%')
);
create index property_documents_property_idx on public.property_documents (property_id);
create index property_documents_org_idx on public.property_documents (organization_id);
create index property_documents_uploaded_by_idx on public.property_documents (uploaded_by);
create unique index property_documents_dedupe_idx on public.property_documents (property_id, sha256);

-- ---------------------------------------------------------------------------
-- Generatiejobs (ook voor extractie en controles)
-- ---------------------------------------------------------------------------
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  job_type public.job_type not null,
  status public.job_status not null default 'wachtrij',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  steps jsonb not null default '{}'::jsonb check (jsonb_typeof(steps) = 'object'),
  current_step text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  input_hash text not null check (char_length(input_hash) <= 128),
  style_guide_id uuid,
  model text,
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  error_code text check (char_length(error_code) <= 80),
  error_message text check (char_length(error_message) <= 500),
  token_usage jsonb not null default '{"input_tokens":0,"output_tokens":0}'::jsonb,
  estimated_cost numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  foreign key (property_id, organization_id) references public.properties (id, organization_id) on delete cascade,
  foreign key (style_guide_id, organization_id) references public.style_guides (id, organization_id),
  constraint generation_jobs_property_required check ((job_type = 'schrijfwijzer_analyse') = (property_id is null)),
  unique (organization_id, idempotency_key),
  unique (id, organization_id)
);
-- Maximaal één lopende volledige generatie per woning.
create unique index generation_jobs_one_active_full_idx on public.generation_jobs (property_id)
  where job_type = 'volledige_generatie' and status in ('wachtrij', 'bezig');
create index generation_jobs_property_idx on public.generation_jobs (property_id, created_at desc);
create index generation_jobs_org_created_idx on public.generation_jobs (organization_id, created_at desc);
create index generation_jobs_requested_by_idx on public.generation_jobs (requested_by);
create index generation_jobs_style_guide_idx on public.generation_jobs (style_guide_id);

-- ---------------------------------------------------------------------------
-- Feiten met bronvermelding
-- ---------------------------------------------------------------------------
create table public.property_facts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  organization_id uuid not null,
  field_name text not null check (field_name ~ '^[a-z][a-z0-9_.]{1,80}$'),
  field_value text not null check (char_length(field_value) <= 4000),
  source_type public.fact_source_type not null,
  source_document_id uuid,
  source_reference text check (char_length(source_reference) <= 500),
  source_quote text check (char_length(source_quote) <= 1000),
  confidence public.confidence_level not null default 'middel',
  verification_status public.verification_status not null default 'onbevestigd',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  extraction_job_id uuid,
  created_at timestamptz not null default now(),
  foreign key (property_id, organization_id) references public.properties (id, organization_id) on delete cascade,
  foreign key (source_document_id, organization_id) references public.property_documents (id, organization_id) on delete cascade,
  foreign key (extraction_job_id, organization_id) references public.generation_jobs (id, organization_id) on delete set null (extraction_job_id),
  -- Bevestiging vereist een mens.
  constraint property_facts_verified_by_human check (
    verification_status <> 'bevestigd' or (verified_by is not null and verified_at is not null)
  )
);
create index property_facts_property_field_idx on public.property_facts (property_id, field_name);
create index property_facts_org_idx on public.property_facts (organization_id);
create index property_facts_document_idx on public.property_facts (source_document_id);
create index property_facts_job_idx on public.property_facts (extraction_job_id);
create index property_facts_verified_by_idx on public.property_facts (verified_by);

-- ---------------------------------------------------------------------------
-- Tekstversies (append-only, behalve goedkeurings- en indieningsvelden via RPC)
-- ---------------------------------------------------------------------------
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  organization_id uuid not null,
  channel public.content_channel not null,
  language public.content_language not null,
  version_number integer not null check (version_number > 0),
  content text not null check (char_length(content) <= 60000),
  status public.content_status not null default 'concept',
  source public.content_source not null,
  -- SEO (alleen website)
  seo_title text check (char_length(seo_title) <= 120),
  meta_description text check (char_length(meta_description) <= 320),
  slug text check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  hashtags text[] not null default '{}'::text[] check (cardinality(hashtags) <= 15),
  prompt_version text check (char_length(prompt_version) <= 40),
  style_guide_id uuid,
  style_guide_version integer,
  generation_job_id uuid,
  based_on_version_id uuid references public.content_versions (id) on delete set null,
  generated_by uuid references auth.users (id) on delete set null,
  edited_by uuid references auth.users (id) on delete set null,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (property_id, organization_id) references public.properties (id, organization_id) on delete cascade,
  foreign key (style_guide_id, organization_id) references public.style_guides (id, organization_id),
  foreign key (generation_job_id, organization_id) references public.generation_jobs (id, organization_id) on delete set null (generation_job_id),
  unique (property_id, channel, language, version_number),
  unique (id, organization_id),
  constraint content_versions_seo_only_website check (
    channel = 'website' or (seo_title is null and meta_description is null and slug is null)
  ),
  constraint content_versions_approval_consistent check (
    (status = 'goedgekeurd') = (approved_by is not null and approved_at is not null)
  ),
  constraint content_versions_author check (generated_by is not null or edited_by is not null)
);
create index content_versions_slot_idx on public.content_versions (property_id, channel, language, version_number desc);
create index content_versions_org_idx on public.content_versions (organization_id);
create index content_versions_job_idx on public.content_versions (generation_job_id);
create index content_versions_style_guide_idx on public.content_versions (style_guide_id);
create index content_versions_based_on_idx on public.content_versions (based_on_version_id);
create index content_versions_generated_by_idx on public.content_versions (generated_by);
create index content_versions_edited_by_idx on public.content_versions (edited_by);
create index content_versions_approved_by_idx on public.content_versions (approved_by);
create index content_versions_submitted_by_idx on public.content_versions (submitted_by);

-- ---------------------------------------------------------------------------
-- Controlepunten
-- ---------------------------------------------------------------------------
create table public.review_issues (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  organization_id uuid not null,
  content_version_id uuid,
  generation_job_id uuid,
  severity public.issue_severity not null,
  category text not null default 'algemeen' check (char_length(category) <= 60),
  field_name text check (char_length(field_name) <= 120),
  description text not null check (char_length(description) between 1 and 2000),
  source_details text check (char_length(source_details) <= 2000),
  resolution_status public.resolution_status not null default 'open',
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (property_id, organization_id) references public.properties (id, organization_id) on delete cascade,
  foreign key (content_version_id, organization_id) references public.content_versions (id, organization_id) on delete cascade,
  foreign key (generation_job_id, organization_id) references public.generation_jobs (id, organization_id) on delete set null (generation_job_id)
);
create index review_issues_property_idx on public.review_issues (property_id, resolution_status);
create index review_issues_org_idx on public.review_issues (organization_id);
create index review_issues_version_idx on public.review_issues (content_version_id);
create index review_issues_job_idx on public.review_issues (generation_job_id);
create index review_issues_resolved_by_idx on public.review_issues (resolved_by);

-- ---------------------------------------------------------------------------
-- AI-verbruik (alleen schrijfbaar via server-RPC)
-- ---------------------------------------------------------------------------
create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  property_id uuid,
  job_id uuid,
  operation text not null check (char_length(operation) <= 60),
  model text not null check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  estimated_cost numeric(12, 6) not null default 0 check (estimated_cost >= 0),
  status text not null check (status in ('gestart', 'succes', 'fout')),
  error_code text check (char_length(error_code) <= 80),
  duration_ms integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- property_id/job_id bewust zonder FK: verbruik blijft bewaard na verwijderen van een dossier (kostenverantwoording).
create index ai_usage_events_org_created_idx on public.ai_usage_events (organization_id, created_at desc);
create index ai_usage_events_user_created_idx on public.ai_usage_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 60),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 20000),
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_user_idx on public.audit_logs (user_id);

create trigger properties_touch before update on public.properties
  for each row execute function private.touch_updated_at();
