-- Migratie 4: private opslag, overzichtsview en bewaarbeleid.

-- ---------------------------------------------------------------------------
-- Private bucket voor woningdossiers. Pad: {organization_id}/{property_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-documents', 'property-documents', false, 26214400,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Toegang tot een object vereist lidmaatschap van de organisatie in het pad én
-- een bestaande woning van die organisatie. Raden van URL's helpt niet: de bucket
-- is privé en downloads lopen via kortlevende signed URLs na deze controle.
create or replace function private.storage_path_allowed(p_name text, p_roles public.app_role[])
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_org uuid;
  v_property uuid;
begin
  if array_length(v_parts, 1) <> 3
     or v_parts[1] !~ '^[0-9a-f-]{36}$' or v_parts[2] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  v_org := v_parts[1]::uuid;
  v_property := v_parts[2]::uuid;
  return private.has_role(v_org, p_roles)
    and exists (select 1 from public.properties p where p.id = v_property and p.organization_id = v_org);
end;
$$;
revoke all on function private.storage_path_allowed(text, public.app_role[]) from public, anon;
grant execute on function private.storage_path_allowed(text, public.app_role[]) to authenticated;

create policy "woningdossiers lezen" on storage.objects for select to authenticated
  using (bucket_id = 'property-documents'
    and private.storage_path_allowed(name, array['admin', 'makelaar', 'redacteur']::public.app_role[]));
create policy "woningdossiers uploaden" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-documents'
    and private.storage_path_allowed(name, array['admin', 'makelaar']::public.app_role[]));
create policy "woningdossiers verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'property-documents'
    and private.storage_path_allowed(name, array['admin', 'makelaar']::public.app_role[]));
-- Bewust geen UPDATE-policy: bestanden worden niet overschreven.

-- ---------------------------------------------------------------------------
-- Overzichtsview voor dashboard (security_invoker: RLS van de bevrager geldt)
-- ---------------------------------------------------------------------------
create or replace view public.property_overview
with (security_invoker = true)
as
select
  p.id,
  p.organization_id,
  p.address,
  p.house_number,
  p.addition,
  p.postcode,
  p.city,
  p.neighbourhood,
  p.property_type,
  p.listing_status,
  p.workflow_status,
  p.asking_price,
  p.assigned_to,
  p.created_by,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  ap.full_name as assigned_to_name,
  coalesce(t.text_count, 0) as text_count,
  coalesce(t.approved_count, 0) as approved_count,
  coalesce(t.review_count, 0) as review_count,
  coalesce(i.open_issue_count, 0) as open_issue_count,
  greatest(p.updated_at, t.last_text_at) as last_activity_at
from public.properties p
left join public.profiles ap on ap.id = p.assigned_to
left join lateral (
  select
    count(*) as text_count,
    count(*) filter (where l.status = 'goedgekeurd') as approved_count,
    count(*) filter (where l.status = 'ter_controle') as review_count,
    max(l.created_at) as last_text_at
  from (
    select distinct on (cv.channel, cv.language) cv.status, cv.created_at
    from public.content_versions cv
    where cv.property_id = p.id
    order by cv.channel, cv.language, cv.version_number desc
  ) l
) t on true
left join lateral (
  select count(*) as open_issue_count
  from public.review_issues ri
  where ri.property_id = p.id and ri.resolution_status = 'open' and ri.severity <> 'info'
) i on true;

grant select on public.property_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Bewaarbeleid: kandidaten voor verwijdering (alleen ter beoordeling door admin;
-- er wordt nooit automatisch verwijderd).
-- ---------------------------------------------------------------------------
create or replace function public.retention_candidates()
returns table (property_id uuid, label text, reason text, last_change timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id,
    trim(concat_ws(' ', p.address, p.house_number, p.addition, ',', p.city)),
    case when p.listing_status in ('verkocht', 'ingetrokken') then 'verkocht_of_ingetrokken' else 'inactief_concept' end,
    p.updated_at
  from public.properties p
  join public.organization_settings s on s.organization_id = p.organization_id
  where private.has_role(p.organization_id, array['admin']::public.app_role[])
    and (
      (p.listing_status in ('verkocht', 'ingetrokken')
        and p.updated_at < now() - make_interval(months => s.retention_months_after_sale))
      or (p.workflow_status = 'concept'
        and p.updated_at < now() - make_interval(months => s.retention_months_inactive_concept))
      or (p.deleted_at is not null and p.deleted_at < now() - interval '30 days')
    )
  order by p.updated_at asc
$$;
grant execute on function public.retention_candidates() to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap (alleen door database-eigenaar uit te voeren, niet via de API):
-- maakt een organisatie aan met standaardinstellingen en een admin-uitnodiging.
-- ---------------------------------------------------------------------------
create or replace function private.bootstrap_organization(p_name text, p_admin_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  insert into public.organizations (name) values (p_name) returning id into v_org;
  insert into public.organization_settings (organization_id) values (v_org);
  insert into public.invitations (organization_id, email, role, expires_at)
  values (v_org, lower(trim(p_admin_email)), 'admin', now() + interval '30 days');
  return v_org;
end;
$$;
revoke all on function private.bootstrap_organization(text, text) from public, anon, authenticated;
