-- Migratie 7: alt-teksten voor foto's, aanwezigheid (wie bewerkt), dashboardcijfers
-- en een dagelijkse samenvatting voor de cron-route.

-- ---------------------------------------------------------------------------
-- Alt-teksten bij foto's (website/toegankelijkheid). Alleen admin en makelaar
-- mogen documenten bijwerken (bestaande policy); de guard beschermt overige kolommen.
-- ---------------------------------------------------------------------------
alter table public.property_documents
  add column alt_text_nl text check (char_length(alt_text_nl) <= 300),
  add column alt_text_en text check (char_length(alt_text_en) <= 300);

-- ---------------------------------------------------------------------------
-- Aanwezigheid: wie heeft de teksten van een woning op dit moment open.
-- Eén rij per gebruiker per woning; bijgewerkt via touch_presence (heartbeat).
-- ---------------------------------------------------------------------------
create table public.property_presence (
  property_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot text not null default '' check (char_length(slot) <= 40),
  seen_at timestamptz not null default now(),
  primary key (property_id, user_id),
  foreign key (property_id, organization_id) references public.properties (id, organization_id) on delete cascade
);
alter table public.property_presence enable row level security;
create policy presence_select on public.property_presence for select to authenticated
  using (private.is_member(organization_id));
grant select on public.property_presence to authenticated;

create or replace function public.touch_presence(p_property_id uuid, p_slot text)
returns table (user_id uuid, full_name text, slot text, seen_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_uid uuid := (select auth.uid());
begin
  select p.organization_id into v_org from public.properties p where p.id = p_property_id;
  if v_uid is null or v_org is null or not private.is_member(v_org) then
    raise exception 'Niet toegestaan' using errcode = '42501';
  end if;
  insert into public.property_presence as pp (property_id, organization_id, user_id, slot, seen_at)
  values (p_property_id, v_org, v_uid, left(coalesce(p_slot, ''), 40), now())
  on conflict (property_id, user_id) do update set slot = excluded.slot, seen_at = excluded.seen_at;

  return query
    select pp.user_id, coalesce(nullif(pr.full_name, ''), pr.email), pp.slot, pp.seen_at
    from public.property_presence pp
    join public.profiles pr on pr.id = pp.user_id
    where pp.property_id = p_property_id
      and pp.user_id <> v_uid
      and pp.seen_at > now() - interval '75 seconds'
    order by pp.seen_at desc;
end;
$$;
revoke execute on function public.touch_presence(uuid, text) from public, anon;
grant execute on function public.touch_presence(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboardcijfers. Security invoker: RLS bepaalt wat de gebruiker ziet
-- (bijv. AI-kosten: admin alles, overige rollen alleen eigen verbruik).
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  v_result jsonb;
begin
  if v_org is null then
    return '{}'::jsonb;
  end if;

  with latest as (
    select distinct on (cv.property_id, cv.channel, cv.language)
      cv.property_id, cv.channel, cv.language, cv.status, cv.source
    from public.content_versions cv
    join public.properties p on p.id = cv.property_id and p.deleted_at is null
    order by cv.property_id, cv.channel, cv.language, cv.version_number desc
  ),
  approved as (
    select cv.property_id, cv.channel, cv.language, cv.approved_at, cv.source,
      (select min(f.created_at) from public.content_versions f
        where f.property_id = cv.property_id and f.channel = cv.channel and f.language = cv.language) as first_at
    from public.content_versions cv
    where cv.status = 'goedgekeurd' and cv.approved_at >= v_since
  ),
  usage as (
    select coalesce(sum(e.estimated_cost), 0) as month_cost,
      count(distinct e.property_id) filter (where e.property_id is not null) as month_properties,
      coalesce(sum(e.estimated_cost) filter (where e.created_at >= date_trunc('day', now())), 0) as today_cost
    from public.ai_usage_events e
    where e.created_at >= date_trunc('month', now())
  )
  select jsonb_build_object(
    'periode_dagen', greatest(1, least(p_days, 365)),
    'woningen_per_status', coalesce((
      select jsonb_object_agg(s.workflow_status, s.n) from (
        select p.workflow_status, count(*) as n from public.properties p where p.deleted_at is null group by p.workflow_status
      ) s), '{}'::jsonb),
    'teksten_ter_controle', (select count(*) from latest where status = 'ter_controle'),
    'goedgekeurd_in_periode', (select count(*) from approved),
    'ongewijzigd_goedgekeurd_pct', (
      select case when count(*) = 0 then null
        else round(100.0 * count(*) filter (where source = 'ai_generatie') / count(*)) end
      from approved),
    'doorlooptijd_uren_mediaan', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from approved_at - first_at) / 3600))::numeric, 1)
      from approved),
    'kosten_maand_eur', (select round(month_cost::numeric, 2) from usage),
    'kosten_vandaag_eur', (select round(today_cost::numeric, 2) from usage),
    'kosten_per_woning_eur', (select case when month_properties = 0 then null else round((month_cost / month_properties)::numeric, 2) end from usage),
    'kosten_per_medewerker', coalesce((
      select jsonb_agg(jsonb_build_object('naam', coalesce(nullif(pr.full_name, ''), pr.email), 'eur', round(t.eur::numeric, 2)) order by t.eur desc)
      from (
        select e.user_id, sum(e.estimated_cost) as eur from public.ai_usage_events e
        where e.created_at >= date_trunc('month', now()) and e.user_id is not null
        group by e.user_id
      ) t join public.profiles pr on pr.id = t.user_id), '[]'::jsonb),
    'budget', (
      select jsonb_build_object('dag_eur', s.ai_daily_cost_limit_eur, 'maand_eur', s.ai_monthly_cost_limit_eur)
      from public.organization_settings s where s.organization_id = v_org),
    'mislukte_generaties_7d', (
      select count(*) from public.generation_jobs j
      where j.status = 'mislukt' and j.created_at >= now() - interval '7 days'),
    'laatste_fouten', coalesce((
      select jsonb_agg(jsonb_build_object('wanneer', x.created_at, 'type', x.job_type, 'melding', x.error_message, 'woning', x.property_id))
      from (
        select j.created_at, j.job_type, j.error_message, j.property_id from public.generation_jobs j
        where j.status = 'mislukt' and j.created_at >= now() - interval '7 days'
        order by j.created_at desc limit 5
      ) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.dashboard_stats(integer) from public, anon;
grant execute on function public.dashboard_stats(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Dagelijkse samenvatting voor de cron-route (zonder gebruikerssessie):
-- alleen met het servergeheim; levert per organisatie alleen aantallen en
-- e-mailadressen van actieve administrators (geen inhoud of adressen).
-- ---------------------------------------------------------------------------
create or replace function public.server_admin_digest(p_secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_server_secret(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'organisatie', o.name,
      'admins', coalesce((
        select jsonb_agg(pr.email) from public.organization_memberships m
        join public.profiles pr on pr.id = m.user_id
        where m.organization_id = o.id and m.role = 'admin' and m.is_active and pr.email <> ''), '[]'::jsonb),
      'bewaartermijn_kandidaten', (
        select count(*) from public.properties p
        join public.organization_settings s on s.organization_id = p.organization_id
        where p.organization_id = o.id and (
          (p.listing_status in ('verkocht', 'ingetrokken') and p.updated_at < now() - make_interval(months => s.retention_months_after_sale))
          or (p.workflow_status = 'concept' and p.updated_at < now() - make_interval(months => s.retention_months_inactive_concept))
          or (p.deleted_at is not null and p.deleted_at < now() - interval '30 days'))),
      'mislukte_generaties_24u', (
        select count(*) from public.generation_jobs j
        where j.organization_id = o.id and j.status = 'mislukt' and j.created_at >= now() - interval '24 hours'),
      'kosten_maand_eur', (
        select round(coalesce(sum(e.estimated_cost), 0)::numeric, 2) from public.ai_usage_events e
        where e.organization_id = o.id and e.created_at >= date_trunc('month', now())),
      'budget_maand_eur', (select s.ai_monthly_cost_limit_eur from public.organization_settings s where s.organization_id = o.id)
    ))
    from public.organizations o), '[]'::jsonb);
end;
$$;
revoke execute on function public.server_admin_digest(text) from public, anon;
grant execute on function public.server_admin_digest(text) to authenticated, anon;
