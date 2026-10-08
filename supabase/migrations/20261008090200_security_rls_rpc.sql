-- Migratie 3: integriteitstriggers, audit logging, RLS-policies en RPC-functies.
--
-- Default deny: RLS staat op ALLE tabellen in public. Zonder expliciete policy
-- is geen enkele rij leesbaar of schrijfbaar voor anon/authenticated.

-- ---------------------------------------------------------------------------
-- Server-geheim voor geprivilegieerde server-RPC's (kostenregistratie, jobstatus).
-- Alleen de SHA-256-hash staat in de database; de waarde zelf staat uitsluitend
-- in de server-omgevingsvariabele SERVER_RPC_SECRET.
-- ---------------------------------------------------------------------------
create table private.server_secrets (
  name text primary key,
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
revoke all on private.server_secrets from public, anon, authenticated;

create or replace function private.assert_server_secret(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_secret is null or char_length(p_secret) < 32 or not exists (
    select 1 from private.server_secrets s
    where s.name = 'server_rpc'
      and s.secret_hash = encode(pg_catalog.sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then
    raise exception 'Ongeautoriseerd' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_server_secret(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit logging
-- ---------------------------------------------------------------------------
create or replace function private.write_audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (p_org, (select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function private.write_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- Generieke audittrigger: logt welke kolommen wijzigden (geen inhoud, om persoonsgegevens
-- niet in het auditlog te dupliceren), plus enkele expliciete statusvelden.
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity text := tg_argv[0];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_meta jsonb := '{}'::jsonb;
  v_key text;
  v_status_keys text[] := array['status', 'workflow_status', 'listing_status', 'role', 'is_active',
    'verification_status', 'resolution_status', 'channel', 'language', 'version_number', 'version',
    'document_type', 'source', 'job_type'];
  v_entity_id uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k) into v_changed
    from jsonb_object_keys(v_new) k
    where v_new -> k is distinct from v_old -> k and k not in ('updated_at', 'heartbeat_at');
    if v_changed is null then
      return new;
    end if;
    v_meta := jsonb_build_object('changed', to_jsonb(v_changed));
  end if;
  foreach v_key in array v_status_keys loop
    if v_row ? v_key then
      if tg_op = 'UPDATE' and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_meta := v_meta || jsonb_build_object(v_key, jsonb_build_object('van', v_old -> v_key, 'naar', v_new -> v_key));
      elsif tg_op <> 'UPDATE' then
        v_meta := v_meta || jsonb_build_object(v_key, v_row -> v_key);
      end if;
    end if;
  end loop;
  v_entity_id := case
    when v_row ? 'id' and (v_row ->> 'id') ~ '^[0-9a-f-]{36}$' then (v_row ->> 'id')::uuid
    when v_row ? 'user_id' then (v_row ->> 'user_id')::uuid
    else null end;
  perform private.write_audit(
    (v_row ->> 'organization_id')::uuid,
    lower(tg_op),
    v_entity,
    v_entity_id,
    v_meta
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_properties after insert or update or delete on public.properties
  for each row execute function private.audit_row('property');
create trigger audit_documents after insert or update or delete on public.property_documents
  for each row execute function private.audit_row('property_document');
create trigger audit_facts after update on public.property_facts
  for each row execute function private.audit_row('property_fact');
create trigger audit_content after insert or update on public.content_versions
  for each row execute function private.audit_row('content_version');
create trigger audit_style_guides after insert or update on public.style_guides
  for each row execute function private.audit_row('style_guide');
create trigger audit_memberships after insert or update or delete on public.organization_memberships
  for each row execute function private.audit_row('membership');
create trigger audit_invitations after insert or update on public.invitations
  for each row execute function private.audit_row('invitation');
create trigger audit_settings after update on public.organization_settings
  for each row execute function private.audit_row('organization_settings');
create trigger audit_jobs after insert on public.generation_jobs
  for each row execute function private.audit_row('generation_job');

-- ---------------------------------------------------------------------------
-- Integriteitstriggers (beschermen tegen mass assignment en vervalsing)
-- ---------------------------------------------------------------------------
create or replace function private.properties_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Vertrouwde context zonder gebruikers-JWT (bijv. ON DELETE SET NULL-cascade bij het
  -- verwijderen van een account via Supabase Auth): geen beperkingen.
  if tg_op = 'UPDATE' and (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.created_at := now();
    new.deleted_at := null;
    new.data_checked_at := null;
    new.data_checked_by := null;
    if new.assigned_to is null then
      new.assigned_to := (select auth.uid());
    end if;
  else
    -- Onveranderlijke kolommen
    new.id := old.id;
    new.organization_id := old.organization_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce((select auth.uid()), old.updated_by);
    -- Archiveren/terugzetten alleen door een administrator
    if new.deleted_at is distinct from old.deleted_at
       and (select auth.uid()) is not null
       and not private.has_role(old.organization_id, array['admin']::public.app_role[]) then
      raise exception 'Alleen een administrator kan woningen archiveren' using errcode = '42501';
    end if;
    -- Controlemarkering kan alleen door de ingelogde gebruiker zelf worden gezet
    if new.data_checked_at is distinct from old.data_checked_at then
      if new.data_checked_at is not null then
        new.data_checked_at := now();
        new.data_checked_by := (select auth.uid());
      else
        new.data_checked_by := null;
      end if;
    elsif new.data_checked_by is distinct from old.data_checked_by then
      new.data_checked_by := old.data_checked_by;
    end if;
  end if;
  -- Verantwoordelijke medewerker moet lid zijn van dezelfde organisatie
  if new.assigned_to is not null and not exists (
    select 1 from public.organization_memberships m
    where m.user_id = new.assigned_to and m.organization_id = new.organization_id and m.is_active
  ) then
    raise exception 'Verantwoordelijke medewerker hoort niet bij deze organisatie' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger properties_guard before insert or update on public.properties
  for each row execute function private.properties_guard();

create or replace function private.documents_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Vertrouwde context zonder gebruikers-JWT (bijv. ON DELETE SET NULL-cascade bij het
  -- verwijderen van een account via Supabase Auth): geen beperkingen.
  if tg_op = 'UPDATE' and (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.uploaded_by := (select auth.uid());
    new.created_at := now();
  else
    new.id := old.id;
    new.property_id := old.property_id;
    new.organization_id := old.organization_id;
    new.storage_path := old.storage_path;
    new.sha256 := old.sha256;
    new.file_size := old.file_size;
    new.mime_type := old.mime_type;
    new.uploaded_by := old.uploaded_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
create trigger documents_guard before insert or update on public.property_documents
  for each row execute function private.documents_guard();

create or replace function private.facts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Vertrouwde context zonder gebruikers-JWT (bijv. ON DELETE SET NULL-cascade bij het
  -- verwijderen van een account via Supabase Auth): geen beperkingen.
  if tg_op = 'UPDATE' and (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Nieuwe feiten zijn nooit vooraf bevestigd, tenzij handmatig ingevoerd door de gebruiker zelf.
    if new.source_type = 'handmatig' and new.verification_status = 'bevestigd' then
      new.verified_by := (select auth.uid());
      new.verified_at := now();
    elsif new.verification_status = 'bevestigd' then
      new.verification_status := 'onbevestigd';
      new.verified_by := null;
      new.verified_at := null;
    else
      new.verified_by := null;
      new.verified_at := null;
    end if;
    new.created_at := now();
  else
    new.id := old.id;
    new.property_id := old.property_id;
    new.organization_id := old.organization_id;
    new.field_name := old.field_name;
    new.field_value := old.field_value;
    new.source_type := old.source_type;
    new.source_document_id := old.source_document_id;
    new.source_reference := old.source_reference;
    new.source_quote := old.source_quote;
    new.confidence := old.confidence;
    new.extraction_job_id := old.extraction_job_id;
    new.created_at := old.created_at;
    if new.verification_status is distinct from old.verification_status then
      if new.verification_status in ('bevestigd', 'afgewezen') then
        new.verified_by := (select auth.uid());
        new.verified_at := now();
      else
        new.verified_by := null;
        new.verified_at := null;
      end if;
    else
      new.verified_by := old.verified_by;
      new.verified_at := old.verified_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger facts_guard before insert or update on public.property_facts
  for each row execute function private.facts_guard();

-- Tekstversies: versienummer wordt server-side bepaald, goedkeuring nooit via insert.
create or replace function private.content_versions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.property_id::text || ':' || new.channel::text || ':' || new.language::text, 0));
    select coalesce(max(cv.version_number), 0) + 1 into new.version_number
    from public.content_versions cv
    where cv.property_id = new.property_id and cv.channel = new.channel and cv.language = new.language;
    new.status := 'concept';
    new.approved_by := null;
    new.approved_at := null;
    new.submitted_by := null;
    new.submitted_at := null;
    new.created_at := now();
    if v_uid is not null then
      if new.source in ('handmatig', 'hersteld') then
        new.edited_by := v_uid;
        new.generated_by := null;
      else
        new.generated_by := v_uid;
        new.edited_by := null;
      end if;
    end if;
    if new.based_on_version_id is not null and not exists (
      select 1 from public.content_versions b
      where b.id = new.based_on_version_id and b.property_id = new.property_id
        and b.channel = new.channel and b.language = new.language
    ) then
      raise exception 'Basisversie hoort niet bij deze tekst' using errcode = '23514';
    end if;
    if new.style_guide_id is not null then
      select sg.version into new.style_guide_version from public.style_guides sg where sg.id = new.style_guide_id;
    end if;
    return new;
  end if;
  -- UPDATE in vertrouwde context zonder JWT (cascade bij accountverwijdering): toegestaan.
  if v_uid is null then
    return new;
  end if;
  -- UPDATE: alleen status/indiening/goedkeuring mogen wijzigen, en alleen via de RPC's hieronder
  if current_setting('app.content_status_rpc', true) is distinct from 'on' then
    raise exception 'Tekstversies zijn onveranderlijk; maak een nieuwe versie' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['status', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at'])
     is distinct from (to_jsonb(old) - array['status', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at']) then
    raise exception 'Alleen de status van een tekstversie kan wijzigen' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger content_versions_guard before insert or update on public.content_versions
  for each row execute function private.content_versions_guard();

create or replace function private.review_issues_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Vertrouwde context zonder gebruikers-JWT (bijv. ON DELETE SET NULL-cascade bij het
  -- verwijderen van een account via Supabase Auth): geen beperkingen.
  if tg_op = 'UPDATE' and (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.resolution_status := 'open';
    new.resolved_by := null;
    new.resolved_at := null;
    new.created_at := now();
    return new;
  end if;
  if (to_jsonb(new) - array['resolution_status', 'resolved_by', 'resolved_at'])
     is distinct from (to_jsonb(old) - array['resolution_status', 'resolved_by', 'resolved_at']) then
    raise exception 'Alleen de afhandelstatus van een controlepunt kan wijzigen' using errcode = '42501';
  end if;
  if new.resolution_status is distinct from old.resolution_status then
    if new.resolution_status = 'open' then
      new.resolved_by := null;
      new.resolved_at := null;
    else
      new.resolved_by := (select auth.uid());
      new.resolved_at := now();
    end if;
  else
    new.resolved_by := old.resolved_by;
    new.resolved_at := old.resolved_at;
  end if;
  return new;
end;
$$;
create trigger review_issues_guard before insert or update on public.review_issues
  for each row execute function private.review_issues_guard();

create or replace function private.generation_jobs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Door clients aangemaakte jobs starten altijd schoon; servervelden zijn niet te vervalsen.
  new.requested_by := coalesce((select auth.uid()), new.requested_by);
  new.status := 'wachtrij';
  new.steps := '{}'::jsonb;
  new.current_step := null;
  new.attempt_count := 0;
  new.started_at := null;
  new.heartbeat_at := null;
  new.finished_at := null;
  new.error_code := null;
  new.error_message := null;
  new.token_usage := '{"input_tokens":0,"output_tokens":0}'::jsonb;
  new.estimated_cost := 0;
  new.created_at := now();
  if new.style_guide_id is null then
    select sg.id into new.style_guide_id from public.style_guides sg
    where sg.organization_id = new.organization_id and sg.is_active;
  end if;
  return new;
end;
$$;
create trigger generation_jobs_guard before insert on public.generation_jobs
  for each row execute function private.generation_jobs_guard();

create or replace function private.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  -- E-mail wordt alleen door de auth-trigger gesynchroniseerd.
  if (select auth.uid()) is not null then
    new.email := old.email;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

create or replace function private.style_guides_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (select auth.uid()) is not null and (to_jsonb(new) - 'is_active') is distinct from (to_jsonb(old) - 'is_active') then
    raise exception 'Schrijfwijzerversies zijn onveranderlijk; publiceer een nieuwe versie' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger style_guides_guard before update on public.style_guides
  for each row execute function private.style_guides_guard();

-- ---------------------------------------------------------------------------
-- Nieuwe auth-gebruikers: profiel aanmaken en geldige uitnodiging accepteren
-- (alleen met bevestigd e-mailadres).
-- ---------------------------------------------------------------------------
create or replace function private.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200),
    lower(coalesce(new.email, ''))
  )
  on conflict (id) do update set email = excluded.email;

  if new.email_confirmed_at is not null and not exists (
    select 1 from public.organization_memberships m where m.user_id = new.id
  ) then
    select * into v_inv from public.invitations i
    where i.email = lower(new.email) and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc limit 1;
    if found then
      insert into public.organization_memberships (organization_id, user_id, role)
      values (v_inv.organization_id, new.id, v_inv.role);
      update public.invitations set accepted_at = now(), accepted_by = new.id where id = v_inv.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_auth_user();
create trigger on_auth_user_confirmed after update of email_confirmed_at, email on auth.users
  for each row execute function private.handle_auth_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.style_guides enable row level security;
alter table public.properties enable row level security;
alter table public.property_documents enable row level security;
alter table public.property_facts enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.content_versions enable row level security;
alter table public.review_issues enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.audit_logs enable row level security;

-- Geen enkele toegang voor anon; authenticated krijgt hieronder uitsluitend expliciete rechten.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.has_role(id, array['admin']::public.app_role[]))
  with check (private.has_role(id, array['admin']::public.app_role[]));

-- organization_settings
create policy org_settings_select on public.organization_settings for select to authenticated
  using (private.is_member(organization_id));
create policy org_settings_update on public.organization_settings for update to authenticated
  using (private.has_role(organization_id, array['admin']::public.app_role[]))
  with check (private.has_role(organization_id, array['admin']::public.app_role[]));

-- profiles: eigen profiel en collega's
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.organization_memberships m
      where m.user_id = profiles.id and m.organization_id = (select private.current_org_id())
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships: leden zien collega's; wijzigen uitsluitend via admin-RPC
create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(organization_id));

-- invitations: alleen admins lezen; schrijven via RPC
create policy invitations_select on public.invitations for select to authenticated
  using (private.has_role(organization_id, array['admin']::public.app_role[]));

-- style_guides: leden lezen; schrijven via admin-RPC
create policy style_guides_select on public.style_guides for select to authenticated
  using (private.is_member(organization_id));

-- properties
create policy properties_select on public.properties for select to authenticated
  using (private.is_member(organization_id));
create policy properties_insert on public.properties for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[])
  );
create policy properties_update on public.properties for update to authenticated
  using (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]))
  with check (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]));

-- property_documents
create policy documents_select on public.property_documents for select to authenticated
  using (private.is_member(organization_id));
create policy documents_insert on public.property_documents for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[])
  );
create policy documents_update on public.property_documents for update to authenticated
  using (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]))
  with check (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]));
create policy documents_delete on public.property_documents for delete to authenticated
  using (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]));

-- property_facts
create policy facts_select on public.property_facts for select to authenticated
  using (private.is_member(organization_id));
create policy facts_insert on public.property_facts for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[])
  );
create policy facts_update on public.property_facts for update to authenticated
  using (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]))
  with check (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]));
create policy facts_delete on public.property_facts for delete to authenticated
  using (private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]));

-- generation_jobs: aanmaken afhankelijk van jobtype en rol; bijwerken alleen via server-RPC
create policy jobs_select on public.generation_jobs for select to authenticated
  using (private.is_member(organization_id));
create policy jobs_insert on public.generation_jobs for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and requested_by = (select auth.uid())
    and (
      (job_type in ('volledige_generatie', 'extractie')
        and private.has_role(organization_id, array['admin', 'makelaar']::public.app_role[]))
      or (job_type in ('enkele_hergeneratie', 'herschrijving', 'tekstcontrole')
        and private.is_member(organization_id))
      or (job_type = 'schrijfwijzer_analyse'
        and private.has_role(organization_id, array['admin']::public.app_role[]))
    )
  );

-- content_versions: alle rollen mogen nieuwe versies schrijven; status alleen via RPC
create policy content_select on public.content_versions for select to authenticated
  using (private.is_member(organization_id));
create policy content_insert on public.content_versions for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and private.is_member(organization_id)
  );

-- review_issues
create policy issues_select on public.review_issues for select to authenticated
  using (private.is_member(organization_id));
create policy issues_insert on public.review_issues for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and private.is_member(organization_id));
create policy issues_update on public.review_issues for update to authenticated
  using (private.is_member(organization_id)) with check (private.is_member(organization_id));

-- ai_usage_events: admin ziet alles binnen de organisatie, anderen hun eigen verbruik
create policy usage_select on public.ai_usage_events for select to authenticated
  using (
    private.has_role(organization_id, array['admin']::public.app_role[])
    or (user_id = (select auth.uid()) and private.is_member(organization_id))
  );

-- audit_logs: alleen admins lezen; niemand wijzigt of verwijdert
create policy audit_select on public.audit_logs for select to authenticated
  using (private.has_role(organization_id, array['admin']::public.app_role[]));

-- Expliciete tabelrechten (RLS bepaalt welke rijen)
grant select, update on public.organizations to authenticated;
grant select, update on public.organization_settings to authenticated;
grant select, update (full_name) on public.profiles to authenticated;
grant select on public.organization_memberships to authenticated;
grant select on public.invitations to authenticated;
grant select on public.style_guides to authenticated;
grant select, insert, update on public.properties to authenticated;
grant select, insert, update, delete on public.property_documents to authenticated;
grant select, insert, update, delete on public.property_facts to authenticated;
grant select, insert on public.generation_jobs to authenticated;
grant select, insert on public.content_versions to authenticated;
grant select, insert, update on public.review_issues to authenticated;
grant select on public.ai_usage_events to authenticated;
grant select on public.audit_logs to authenticated;

-- ---------------------------------------------------------------------------
-- Afgeleide statussen
-- ---------------------------------------------------------------------------
create or replace function private.refresh_property_workflow(p_property uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest_total integer;
  v_latest_approved integer;
  v_in_review integer;
  v_current public.workflow_status;
begin
  select workflow_status into v_current from public.properties where id = p_property;
  if v_current is null or v_current = 'gearchiveerd' then
    return;
  end if;
  with latest as (
    select distinct on (channel, language) channel, language, status
    from public.content_versions
    where property_id = p_property
    order by channel, language, version_number desc
  )
  select count(*), count(*) filter (where status = 'goedgekeurd'), count(*) filter (where status = 'ter_controle')
  into v_latest_total, v_latest_approved, v_in_review
  from latest;

  update public.properties set workflow_status = case
      when v_latest_total = 8 and v_latest_approved = 8 then 'goedgekeurd'::public.workflow_status
      when v_in_review > 0 or v_latest_approved > 0 then 'in_controle'::public.workflow_status
      else 'concept'::public.workflow_status
    end
  where id = p_property and workflow_status is distinct from (case
      when v_latest_total = 8 and v_latest_approved = 8 then 'goedgekeurd'::public.workflow_status
      when v_in_review > 0 or v_latest_approved > 0 then 'in_controle'::public.workflow_status
      else 'concept'::public.workflow_status
    end);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: tekstversies (indienen, goedkeuren, intrekken, opslaan met conflictdetectie)
-- ---------------------------------------------------------------------------
create or replace function public.save_content_version(
  p_property_id uuid,
  p_channel public.content_channel,
  p_language public.content_language,
  p_content text,
  p_source public.content_source,
  p_expected_version integer,
  p_based_on_version_id uuid default null,
  p_seo_title text default null,
  p_meta_description text default null,
  p_slug text default null,
  p_hashtags text[] default '{}',
  p_generation_job_id uuid default null,
  p_style_guide_id uuid default null,
  p_prompt_version text default null
) returns public.content_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_latest integer;
  v_row public.content_versions;
begin
  select organization_id into v_org from public.properties where id = p_property_id and deleted_at is null;
  if v_org is null or not private.is_member(v_org) then
    raise exception 'Woning niet gevonden' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_property_id::text || ':' || p_channel::text || ':' || p_language::text, 0));
  select coalesce(max(version_number), 0) into v_latest
  from public.content_versions where property_id = p_property_id and channel = p_channel and language = p_language;
  if p_expected_version is not null and v_latest <> p_expected_version then
    raise exception 'Versieconflict: er is intussen een nieuwere versie opgeslagen (v%)', v_latest using errcode = '40001';
  end if;
  insert into public.content_versions (
    property_id, organization_id, channel, language, version_number, content, source,
    seo_title, meta_description, slug, hashtags, based_on_version_id, generation_job_id, style_guide_id, prompt_version
  ) values (
    p_property_id, v_org, p_channel, p_language, 1, p_content, p_source,
    p_seo_title, p_meta_description, p_slug, coalesce(p_hashtags, '{}'), p_based_on_version_id, p_generation_job_id,
    p_style_guide_id, p_prompt_version
  ) returning * into v_row;
  perform private.refresh_property_workflow(p_property_id);
  return v_row;
end;
$$;

create or replace function public.set_content_status(p_version_id uuid, p_status public.content_status)
returns public.content_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.content_versions;
  v_uid uuid := (select auth.uid());
begin
  select * into v_row from public.content_versions where id = p_version_id for update;
  if v_row.id is null or not private.is_member(v_row.organization_id) then
    raise exception 'Tekstversie niet gevonden' using errcode = 'P0002';
  end if;
  if p_status = 'goedgekeurd' and not private.can_approve(v_row.organization_id) then
    raise exception 'U heeft geen goedkeuringsrechten' using errcode = '42501';
  end if;
  if v_row.status = 'goedgekeurd' and p_status <> 'goedgekeurd' and not private.can_approve(v_row.organization_id) then
    raise exception 'Alleen goedkeurders kunnen een goedkeuring intrekken' using errcode = '42501';
  end if;
  perform set_config('app.content_status_rpc', 'on', true);
  update public.content_versions set
    status = p_status,
    submitted_by = case when p_status = 'ter_controle' then v_uid when p_status = 'concept' then null else submitted_by end,
    submitted_at = case when p_status = 'ter_controle' then now() when p_status = 'concept' then null else submitted_at end,
    approved_by = case when p_status = 'goedgekeurd' then v_uid else null end,
    approved_at = case when p_status = 'goedgekeurd' then now() else null end
  where id = p_version_id
  returning * into v_row;
  perform set_config('app.content_status_rpc', 'off', true);
  perform private.refresh_property_workflow(v_row.property_id);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: schrijfwijzer
-- ---------------------------------------------------------------------------
create or replace function public.publish_style_guide(
  p_title text, p_content text, p_change_note text, p_activate boolean default true
) returns public.style_guides
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_next integer;
  v_row public.style_guides;
begin
  if v_org is null or not private.has_role(v_org, array['admin']::public.app_role[]) then
    raise exception 'Alleen een administrator kan de schrijfwijzer wijzigen' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('style_guide:' || v_org::text, 0));
  select coalesce(max(version), 0) + 1 into v_next from public.style_guides where organization_id = v_org;
  if p_activate then
    update public.style_guides set is_active = false where organization_id = v_org and is_active;
  end if;
  insert into public.style_guides (organization_id, version, title, content, change_note, is_active, created_by)
  values (v_org, v_next, coalesce(nullif(trim(p_title), ''), 'Schrijfwijzer'), p_content, coalesce(p_change_note, ''), p_activate, (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.activate_style_guide(p_id uuid)
returns public.style_guides
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.style_guides;
begin
  select * into v_row from public.style_guides where id = p_id;
  if v_row.id is null or not private.has_role(v_row.organization_id, array['admin']::public.app_role[]) then
    raise exception 'Alleen een administrator kan de schrijfwijzer activeren' using errcode = '42501';
  end if;
  update public.style_guides set is_active = false where organization_id = v_row.organization_id and is_active and id <> p_id;
  update public.style_guides set is_active = true where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: gebruikersbeheer (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_invitation(p_email text, p_role public.app_role)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_row public.invitations;
  v_email text := lower(trim(p_email));
  v_existing_user uuid;
begin
  if v_org is null or not private.has_role(v_org, array['admin']::public.app_role[]) then
    raise exception 'Alleen een administrator kan gebruikers uitnodigen' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now()
  where email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (organization_id, email, role, invited_by)
  values (v_org, v_email, p_role, (select auth.uid()))
  returning * into v_row;

  -- Bestaat er al een bevestigde gebruiker zonder organisatie? Koppel direct.
  select u.id into v_existing_user from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null;
  if v_existing_user is not null and not exists (
    select 1 from public.organization_memberships m where m.user_id = v_existing_user
  ) then
    insert into public.organization_memberships (organization_id, user_id, role) values (v_org, v_existing_user, p_role);
    update public.invitations set accepted_at = now(), accepted_by = v_existing_user where id = v_row.id
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.admin_revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.invitations where id = p_id;
  if v_org is null or not private.has_role(v_org, array['admin']::public.app_role[]) then
    raise exception 'Niet toegestaan' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now() where id = p_id and accepted_at is null;
end;
$$;

create or replace function public.admin_update_member(p_user_id uuid, p_role public.app_role, p_is_active boolean)
returns public.organization_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_row public.organization_memberships;
  v_remaining_admins integer;
begin
  if v_org is null or not private.has_role(v_org, array['admin']::public.app_role[]) then
    raise exception 'Alleen een administrator kan rollen wijzigen' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'U kunt uw eigen rol of status niet wijzigen' using errcode = '42501';
  end if;
  update public.organization_memberships set role = p_role, is_active = p_is_active
  where organization_id = v_org and user_id = p_user_id
  returning * into v_row;
  if v_row.user_id is null then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002';
  end if;
  select count(*) into v_remaining_admins from public.organization_memberships
  where organization_id = v_org and role = 'admin' and is_active;
  if v_remaining_admins < 1 then
    raise exception 'Er moet minimaal één actieve administrator overblijven' using errcode = '23514';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: dossier definitief verwijderen (AVG). Opslagobjecten worden door de server
-- vooraf verwijderd via de Storage API; deze functie verwijdert de databaserijen.
-- Audit-logregels en kostenregistratie blijven bewaard zonder persoonsgegevens.
-- ---------------------------------------------------------------------------
create or replace function public.purge_property(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.properties where id = p_property_id;
  if v_org is null or not private.has_role(v_org, array['admin']::public.app_role[]) then
    raise exception 'Alleen een administrator kan een dossier definitief verwijderen' using errcode = '42501';
  end if;
  if exists (select 1 from public.property_documents where property_id = p_property_id) then
    raise exception 'Verwijder eerst de gekoppelde documenten' using errcode = '23503';
  end if;
  perform private.write_audit(v_org, 'purge', 'property', p_property_id, '{}'::jsonb);
  delete from public.properties where id = p_property_id;
end;
$$;

create or replace function public.log_event(p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
begin
  if v_org is null then
    raise exception 'Geen organisatie' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z_]{2,60}$' or p_entity_type !~ '^[a-z_]{2,60}$' then
    raise exception 'Ongeldige auditactie' using errcode = '22023';
  end if;
  perform private.write_audit(v_org, 'app.' || p_action, p_entity_type, p_entity_id,
    jsonb_strip_nulls(coalesce(p_metadata, '{}'::jsonb)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-RPC's (vereisen SERVER_RPC_SECRET). De server roept deze aan met het
-- JWT van de ingelogde gebruiker; het geheim voorkomt dat een gebruiker via de
-- Data API zelf kosten of jobstatussen manipuleert.
-- ---------------------------------------------------------------------------
create or replace function public.server_ai_reserve(
  p_secret text, p_operation text, p_model text, p_property_id uuid, p_job_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_s public.organization_settings;
  v_minute integer;
  v_user_day integer;
  v_org_day numeric;
  v_org_month numeric;
  v_id uuid;
begin
  perform private.assert_server_secret(p_secret);
  v_org := private.current_org_id();
  if v_uid is null or v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'geen_toegang');
  end if;
  if p_property_id is not null and not exists (
    select 1 from public.properties where id = p_property_id and organization_id = v_org
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'geen_toegang');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || v_org::text, 0));
  select * into v_s from public.organization_settings where organization_id = v_org;
  if v_s.organization_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'geen_instellingen');
  end if;
  -- Verlopen reserveringen (vastgelopen requests) niet laten meetellen als lopend
  update public.ai_usage_events set status = 'fout', error_code = 'verlopen', finished_at = now()
  where organization_id = v_org and status = 'gestart' and created_at < now() - interval '15 minutes';

  select count(*) into v_minute from public.ai_usage_events
  where user_id = v_uid and created_at > now() - interval '1 minute';
  if v_minute >= v_s.ai_requests_per_minute_per_user then
    return jsonb_build_object('allowed', false, 'reason', 'te_veel_verzoeken_per_minuut');
  end if;
  select count(*) into v_user_day from public.ai_usage_events
  where user_id = v_uid and created_at > date_trunc('day', now());
  if v_user_day >= v_s.ai_daily_requests_per_user then
    return jsonb_build_object('allowed', false, 'reason', 'daglimiet_gebruiker');
  end if;
  select coalesce(sum(estimated_cost), 0) into v_org_day from public.ai_usage_events
  where organization_id = v_org and created_at > date_trunc('day', now());
  if v_org_day >= v_s.ai_daily_cost_limit_eur then
    return jsonb_build_object('allowed', false, 'reason', 'daglimiet_kosten');
  end if;
  select coalesce(sum(estimated_cost), 0) into v_org_month from public.ai_usage_events
  where organization_id = v_org and created_at > date_trunc('month', now());
  if v_org_month >= v_s.ai_monthly_cost_limit_eur then
    return jsonb_build_object('allowed', false, 'reason', 'maandlimiet_kosten');
  end if;

  insert into public.ai_usage_events (organization_id, user_id, property_id, job_id, operation, model, status)
  values (v_org, v_uid, p_property_id, p_job_id, left(p_operation, 60), left(p_model, 80), 'gestart')
  returning id into v_id;
  return jsonb_build_object('allowed', true, 'event_id', v_id);
end;
$$;

create or replace function public.server_ai_finish(
  p_secret text, p_event_id uuid, p_status text, p_input_tokens integer, p_output_tokens integer,
  p_cache_read_tokens integer, p_estimated_cost numeric, p_error_code text, p_duration_ms integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.ai_usage_events;
begin
  perform private.assert_server_secret(p_secret);
  update public.ai_usage_events set
    status = case when p_status = 'succes' then 'succes' else 'fout' end,
    input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
    output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    cache_read_tokens = greatest(coalesce(p_cache_read_tokens, 0), 0),
    estimated_cost = greatest(coalesce(p_estimated_cost, 0), 0),
    error_code = left(p_error_code, 80),
    duration_ms = p_duration_ms,
    finished_at = now()
  where id = p_event_id and user_id = (select auth.uid()) and status = 'gestart'
  returning * into v_ev;
  if v_ev.id is not null and v_ev.job_id is not null then
    update public.generation_jobs set
      token_usage = jsonb_build_object(
        'input_tokens', coalesce((token_usage ->> 'input_tokens')::bigint, 0) + v_ev.input_tokens,
        'output_tokens', coalesce((token_usage ->> 'output_tokens')::bigint, 0) + v_ev.output_tokens),
      estimated_cost = estimated_cost + v_ev.estimated_cost,
      model = v_ev.model
    where id = v_ev.job_id and organization_id = v_ev.organization_id;
  end if;
end;
$$;

-- Claim een job voor verwerking. Geeft de job terug als deze (opnieuw) mag draaien,
-- anders null (al bezig door een andere request en niet verlopen, of afgerond).
create or replace function public.server_job_claim(p_secret text, p_job_id uuid, p_stale_seconds integer default 180)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.generation_jobs;
begin
  perform private.assert_server_secret(p_secret);
  update public.generation_jobs j set
    status = 'bezig',
    started_at = coalesce(j.started_at, now()),
    heartbeat_at = now(),
    attempt_count = j.attempt_count + 1,
    error_code = null,
    error_message = null
  where j.id = p_job_id
    and private.is_member(j.organization_id)
    and (
      j.status = 'wachtrij'
      or j.status = 'mislukt'
      or (j.status = 'bezig' and (j.heartbeat_at is null or j.heartbeat_at < now() - make_interval(secs => p_stale_seconds)))
    )
    and j.attempt_count < 12
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.server_job_update(
  p_secret text, p_job_id uuid, p_status public.job_status, p_current_step text,
  p_steps_patch jsonb, p_error_code text, p_error_message text
) returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.generation_jobs;
begin
  perform private.assert_server_secret(p_secret);
  update public.generation_jobs j set
    status = coalesce(p_status, j.status),
    current_step = coalesce(p_current_step, j.current_step),
    steps = j.steps || coalesce(p_steps_patch, '{}'::jsonb),
    heartbeat_at = now(),
    finished_at = case when p_status in ('voltooid', 'mislukt', 'geannuleerd') then now() else j.finished_at end,
    error_code = case when p_status = 'mislukt' then left(p_error_code, 80) when p_status = 'voltooid' then null else j.error_code end,
    error_message = case when p_status = 'mislukt' then left(p_error_message, 500) when p_status = 'voltooid' then null else j.error_message end
  where j.id = p_job_id and private.is_member(j.organization_id)
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Job niet gevonden' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- Gebruikers mogen hun eigen lopende job annuleren.
create or replace function public.cancel_generation_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_jobs set status = 'geannuleerd', finished_at = now()
  where id = p_job_id and private.is_member(organization_id)
    and (requested_by = (select auth.uid()) or private.has_role(organization_id, array['admin']::public.app_role[]))
    and status in ('wachtrij', 'bezig', 'mislukt');
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechten op functies: standaard niemand, expliciet authenticated.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.save_content_version(uuid, public.content_channel, public.content_language, text, public.content_source, integer, uuid, text, text, text, text[], uuid, uuid, text) to authenticated;
grant execute on function public.set_content_status(uuid, public.content_status) to authenticated;
grant execute on function public.publish_style_guide(text, text, text, boolean) to authenticated;
grant execute on function public.activate_style_guide(uuid) to authenticated;
grant execute on function public.admin_create_invitation(text, public.app_role) to authenticated;
grant execute on function public.admin_revoke_invitation(uuid) to authenticated;
grant execute on function public.admin_update_member(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.purge_property(uuid) to authenticated;
grant execute on function public.log_event(text, text, uuid, jsonb) to authenticated;
grant execute on function public.server_ai_reserve(text, text, text, uuid, uuid) to authenticated;
grant execute on function public.server_ai_finish(text, uuid, text, integer, integer, integer, numeric, text, integer) to authenticated;
grant execute on function public.server_job_claim(text, uuid, integer) to authenticated;
grant execute on function public.server_job_update(text, uuid, public.job_status, text, jsonb, text, text) to authenticated;
grant execute on function public.cancel_generation_job(uuid) to authenticated;

grant execute on function private.refresh_property_workflow(uuid) to authenticated;
revoke execute on function private.refresh_property_workflow(uuid) from public, anon;

alter default privileges in schema public revoke execute on functions from public, anon;
