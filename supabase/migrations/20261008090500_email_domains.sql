-- Migratie 6: toegang op basis van e-maildomein.
--
-- Een administrator kan een domein (bijv. korffdegidts.nl) aan de organisatie
-- koppelen. Iedereen die een account aanmaakt en een adres op dat domein
-- BEVESTIGT, wordt automatisch lid met de standaardrol van het domein.
-- Een persoonlijke uitnodiging gaat altijd voor (die bepaalt de rol).
-- Publieke maildomeinen (gmail.com e.d.) zijn niet toegestaan.

create table public.organization_email_domains (
  domain text primary key
    check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  default_role public.app_role not null default 'redacteur',
  -- Ontkoppelen = deactiveren (blijft zichtbaar in auditlog en kan opnieuw worden geactiveerd).
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index organization_email_domains_org_idx on public.organization_email_domains (organization_id);

alter table public.organization_email_domains enable row level security;
create policy email_domains_select on public.organization_email_domains for select to authenticated
  using (private.has_role(organization_id, array['admin']::public.app_role[]));
grant select on public.organization_email_domains to authenticated;

create trigger audit_email_domains after insert or update or delete on public.organization_email_domains
  for each row execute function private.audit_row('email_domain');

create or replace function private.is_public_mail_domain(p_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_domain = any (array[
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'outlook.nl', 'live.com', 'live.nl',
    'msn.com', 'yahoo.com', 'yahoo.nl', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
    'gmx.com', 'gmx.net', 'ziggo.nl', 'kpnmail.nl', 'kpnplanet.nl', 'planet.nl', 'home.nl', 'xs4all.nl', 'hetnet.nl',
    'casema.nl', 'chello.nl', 'upcmail.nl', 'tele2.nl', 'online.nl', 'quicknet.nl', 'zeelandnet.nl', 'telfort.nl'
  ])
$$;

-- Nieuwe/bevestigde gebruikers: uitnodiging gaat voor, anders domeinregel.
create or replace function private.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
  v_dom public.organization_email_domains%rowtype;
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
    else
      select * into v_dom from public.organization_email_domains d
      where d.domain = split_part(lower(new.email), '@', 2) and d.is_active;
      if found then
        insert into public.organization_memberships (organization_id, user_id, role)
        values (v_dom.organization_id, new.id, v_dom.default_role);
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_email_domain(p_domain text, p_role public.app_role)
returns public.organization_email_domains
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_domain text := lower(trim(both from regexp_replace(coalesce(p_domain, ''), '^.*@', '')));
  v_row public.organization_email_domains;
begin
  if v_org is null or not private.has_role(v_org, array['admin']::public.app_role[]) then
    raise exception 'Alleen een administrator kan domeinen beheren' using errcode = '42501';
  end if;
  if v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'Ongeldig domein' using errcode = '22023';
  end if;
  if private.is_public_mail_domain(v_domain) then
    raise exception 'Een publiek maildomein kan niet worden toegevoegd; nodig deze persoon afzonderlijk uit' using errcode = '22023';
  end if;
  if exists (select 1 from public.organization_email_domains d where d.domain = v_domain and d.organization_id <> v_org) then
    raise exception 'Dit domein is al aan een andere organisatie gekoppeld' using errcode = '42501';
  end if;

  insert into public.organization_email_domains (domain, organization_id, default_role, created_by)
  values (v_domain, v_org, p_role, (select auth.uid()))
  on conflict (domain) do update set default_role = excluded.default_role, is_active = true
  returning * into v_row;

  -- Bestaande bevestigde gebruikers op dit domein zonder organisatie direct koppelen.
  insert into public.organization_memberships (organization_id, user_id, role)
  select v_org, u.id, p_role
  from auth.users u
  where split_part(lower(u.email), '@', 2) = v_domain
    and u.email_confirmed_at is not null
    and exists (select 1 from public.profiles p where p.id = u.id)
    and not exists (select 1 from public.organization_memberships m where m.user_id = u.id);

  return v_row;
end;
$$;

create or replace function public.admin_remove_email_domain(p_domain text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
begin
  if v_org is null or not private.has_role(v_org, array['admin']::public.app_role[]) then
    raise exception 'Alleen een administrator kan domeinen beheren' using errcode = '42501';
  end if;
  -- Bestaande leden blijven lid; alleen nieuwe automatische toegang stopt.
  update public.organization_email_domains set is_active = false
  where domain = lower(trim(p_domain)) and organization_id = v_org;
end;
$$;

revoke execute on function public.admin_set_email_domain(text, public.app_role) from public, anon;
revoke execute on function public.admin_remove_email_domain(text) from public, anon;
revoke execute on function private.is_public_mail_domain(text) from public, anon;
grant execute on function public.admin_set_email_domain(text, public.app_role) to authenticated;
grant execute on function public.admin_remove_email_domain(text) to authenticated;
