-- Korff de Gidts | Woningtekst Studio
-- Migratie 1: kernschema, types en helperfuncties.
--
-- Uitgangspunten
--  * organization_memberships is de ENIGE gezaghebbende bron voor organisatie en rol.
--    profiles bevat uitsluitend weergavegegevens (naam, e-mail).
--  * Alle kindtabellen dragen organization_id en verwijzen met een samengestelde
--    foreign key (property_id, organization_id) naar properties. Daardoor kan een
--    rij nooit aan een woning van een andere organisatie gekoppeld worden.
--  * Helperfuncties voor RLS staan in het schema "private", dat niet via de
--    Data API wordt ontsloten.

create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enum-types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'makelaar', 'redacteur');

create type public.workflow_status as enum ('concept', 'in_controle', 'goedgekeurd', 'gearchiveerd');

create type public.listing_status as enum (
  'in_voorbereiding', 'beschikbaar', 'onder_bod', 'verkocht_onder_voorbehoud', 'verkocht', 'ingetrokken'
);

create type public.sale_condition as enum ('kosten_koper', 'vrij_op_naam');

create type public.content_channel as enum ('funda', 'website', 'facebook', 'instagram');
create type public.content_language as enum ('nl', 'en');
create type public.content_status as enum ('concept', 'ter_controle', 'goedgekeurd');
create type public.content_source as enum ('ai_generatie', 'ai_herschrijving', 'handmatig', 'hersteld');

create type public.job_type as enum ('volledige_generatie', 'enkele_hergeneratie', 'herschrijving', 'tekstcontrole', 'extractie', 'schrijfwijzer_analyse');
create type public.job_status as enum ('wachtrij', 'bezig', 'voltooid', 'mislukt', 'geannuleerd');

create type public.document_type as enum (
  'originele_omschrijving', 'verkoopdossier', 'meetrapport', 'plattegrond', 'foto', 'energielabel', 'vve_document', 'overig'
);
create type public.extraction_status as enum ('niet_gestart', 'bezig', 'voltooid', 'mislukt', 'niet_van_toepassing');

create type public.fact_source_type as enum ('document', 'geplakte_tekst', 'handmatig');
create type public.verification_status as enum ('onbevestigd', 'bevestigd', 'conflict', 'afgewezen');
create type public.confidence_level as enum ('hoog', 'middel', 'laag');

create type public.issue_severity as enum ('info', 'waarschuwing', 'kritiek');
create type public.resolution_status as enum ('open', 'opgelost', 'genegeerd');

-- ---------------------------------------------------------------------------
-- Organisaties, profielen, lidmaatschappen
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  created_at timestamptz not null default now()
);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  ai_daily_cost_limit_eur numeric(10, 2) not null default 25 check (ai_daily_cost_limit_eur >= 0),
  ai_monthly_cost_limit_eur numeric(10, 2) not null default 300 check (ai_monthly_cost_limit_eur >= 0),
  ai_requests_per_minute_per_user integer not null default 12 check (ai_requests_per_minute_per_user between 1 and 600),
  ai_daily_requests_per_user integer not null default 300 check (ai_daily_requests_per_user between 1 and 100000),
  approval_roles public.app_role[] not null default array['admin', 'makelaar']::public.app_role[],
  retention_months_after_sale integer not null default 24 check (retention_months_after_sale between 1 and 240),
  retention_months_inactive_concept integer not null default 12 check (retention_months_inactive_concept between 1 and 240),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  email text not null default '' check (char_length(email) <= 320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  -- Eén organisatie per gebruiker: voorkomt ambiguïteit over de actieve organisatie.
  constraint organization_memberships_user_unique unique (user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role not null,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create unique index invitations_open_email_idx on public.invitations (email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Private helperfuncties (security definer, vaste search_path)
-- ---------------------------------------------------------------------------
create or replace function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_memberships m
  where m.user_id = (select auth.uid()) and m.is_active
  limit 1
$$;

create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_memberships m
  where m.user_id = (select auth.uid()) and m.is_active
  limit 1
$$;

create or replace function private.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.user_id = (select auth.uid()) and m.organization_id = p_org and m.is_active
  )
$$;

create or replace function private.has_role(p_org uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org
      and m.is_active
      and m.role = any (p_roles)
  )
$$;

create or replace function private.can_approve(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organization_settings s on s.organization_id = m.organization_id
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org
      and m.is_active
      and m.role = any (s.approval_roles)
  )
$$;

revoke all on function private.current_org_id() from public;
revoke all on function private.current_role() from public;
revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid, public.app_role[]) from public;
revoke all on function private.can_approve(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_org_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.app_role[]) to authenticated;
grant execute on function private.can_approve(uuid) to authenticated;

-- Generieke updated_at-trigger
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.organization_memberships
  for each row execute function private.touch_updated_at();
create trigger org_settings_touch before update on public.organization_settings
  for each row execute function private.touch_updated_at();
