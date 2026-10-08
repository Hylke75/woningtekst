-- Twee-stapsverificatie (TOTP, Supabase Auth MFA) afdwingen in de database.
--
-- De applicatie controleert dit al (src/lib/auth/session.ts + mfa.ts), maar de
-- publishable key is openbaar: wie alleen een wachtwoord heeft, kan met een
-- aal1-JWT rechtstreeks PostgREST aanroepen. Daarom dwingen de centrale
-- helperfuncties (gebruikt door alle RLS-policies, storage-policies en RPC's)
-- dezelfde regels af:
--   1. Gebruiker met een geverifieerde factor: zonder aal2-sessie geen toegang
--      tot organisatiegegevens (alleen eigen profiel/lidmaatschap blijft leesbaar).
--   2. Admin-only bewerkingen (has_role met uitsluitend 'admin') vereisen een
--      aal2-sessie. Overige rechten van een admin werken ook zonder MFA.
-- Gebruikers zonder factor (makelaar/redacteur) merken niets.

-- Niveau van de huidige sessie uit het JWT (door PostgREST geverifieerd).
create or replace function private.jwt_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1')
$$;

-- Of de huidige gebruiker een geverifieerde MFA-factor heeft.
create or replace function private.has_verified_factor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = (select auth.uid()) and f.status = 'verified'
  )
$$;

-- Waar als de sessie voldoet: aal2, of de gebruiker heeft (nog) geen factor.
create or replace function private.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.jwt_aal() = 'aal2' or not private.has_verified_factor()
$$;

create or replace function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_memberships m
  where m.user_id = (select auth.uid()) and m.is_active and private.mfa_ok()
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
  where m.user_id = (select auth.uid()) and m.is_active and private.mfa_ok()
  limit 1
$$;

create or replace function private.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.mfa_ok() and exists (
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
  select private.mfa_ok()
    -- Admin-only bewerkingen: alleen met een aal2-sessie (MFA verplicht voor beheer).
    and (not (p_roles <@ array['admin']::public.app_role[]) or private.jwt_aal() = 'aal2')
    and exists (
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
  select private.mfa_ok() and exists (
    select 1
    from public.organization_memberships m
    join public.organization_settings s on s.organization_id = m.organization_id
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org
      and m.is_active
      and m.role = any (s.approval_roles)
  )
$$;

revoke all on function private.jwt_aal() from public;
revoke all on function private.has_verified_factor() from public;
revoke all on function private.mfa_ok() from public;
grant execute on function private.jwt_aal() to authenticated;
grant execute on function private.has_verified_factor() to authenticated;
grant execute on function private.mfa_ok() to authenticated;

-- Voor de applicatie: heeft de ingelogde gebruiker een geverifieerde factor?
-- Gezaghebbend (auth.mfa_factors), in tegenstelling tot de gebruikersgegevens
-- in de sessiecookie. Geeft alleen informatie over de aanroeper zelf.
create or replace function public.mfa_status()
returns table (has_verified_factor boolean, current_level text)
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_verified_factor(), private.jwt_aal()
  where (select auth.uid()) is not null
$$;

revoke all on function public.mfa_status() from public, anon;
grant execute on function public.mfa_status() to authenticated;
