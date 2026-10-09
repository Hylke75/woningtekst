-- Migratie 9: bewerkbare schrijfstijlen per makelaar.
--
-- Elke organisatie heeft eigen schrijfstijlen (bijv. "Wim – zeer zakelijk").
-- Een stijl stuurt alleen toon, ritme en lengte; feiten en privacyregels blijven
-- altijd gelden. Alleen administrators beheren stijlen (admin-only = MFA vereist).
-- Een woning kan bij het aanmaken aan een makelaar/stijl worden gekoppeld.

create table public.writing_styles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  label text not null check (char_length(trim(label)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 200),
  instruction text not null check (char_length(instruction) between 20 and 8000),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (organization_id, name),
  unique (id, organization_id)
);
alter table public.writing_styles enable row level security;
create policy writing_styles_select on public.writing_styles for select to authenticated
  using (private.is_member(organization_id));
create policy writing_styles_insert on public.writing_styles for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and private.has_role(organization_id, array['admin']::public.app_role[])
  );
create policy writing_styles_update on public.writing_styles for update to authenticated
  using (private.has_role(organization_id, array['admin']::public.app_role[]))
  with check (private.has_role(organization_id, array['admin']::public.app_role[]));
grant select, insert, update on public.writing_styles to authenticated;

create or replace function private.writing_styles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.organization_id := old.organization_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;
create trigger writing_styles_guard before insert or update on public.writing_styles
  for each row execute function private.writing_styles_guard();
create trigger audit_writing_styles after insert or update on public.writing_styles
  for each row execute function private.audit_row('writing_style');

-- Standaardstijlen (bewerkbaar). Bestaande stijlen met dezelfde naam blijven ongemoeid.
create or replace function private.seed_writing_styles(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.writing_styles (organization_id, name, label, description, instruction, sort_order)
  values
    (p_org, 'Wim', 'Wim – zeer zakelijk', 'Kort, feitelijk, opsommend; geen sfeer', $w$Schrijfstijl "Wim – zeer zakelijk". Deze stijl gaat VOOR de toon- en lengterichtlijnen van de schrijfwijzer:
- Schrijf als een nuchtere taxateur: uitsluitend feiten, getallen en voorzieningen. Geen sfeer, geen beleving, geen bijvoeglijke naamwoorden die niet meetbaar zijn (dus niet: sfeervol, heerlijk, prachtig, gezellig, royaal, karakteristiek).
- Korte zinnen van gemiddeld 6–10 woorden. Veel zinnen zonder werkwoord zijn toegestaan ("Bouwjaar 1932. Woonoppervlakte 142 m². Energielabel C.").
- Begin de introductie met de kerngegevens (type, oppervlakte, kamers, bouwjaar, energielabel) in één of twee regels. Geen verhaal, geen toekomstige bewoner als hoofdpersoon, geen "stel je voor".
- Zo veel mogelijk opsommingen; elke alinea maximaal 2 zinnen.
- Geen uitroeptekens. Geen vragen. Zakelijke u-vorm mag ("U betreedt de woning via…") in plaats van je-vorm.
- Lengte: ongeveer de helft van de richtlijn; Funda circa 300–450 woorden, website circa 150–220, Facebook circa 50–70, Instagram circa 30–50.
- Social media: feitelijke aankondiging met kerngegevens en "Bezichtiging op afspraak." Niets meer.$w$, 1),
    (p_org, 'Vivianne', 'Vivianne – heel vrolijk', 'Enthousiast, energiek, uitroeptekens', $w$Schrijfstijl "Vivianne – heel vrolijk". Deze stijl gaat VOOR de toon- en lengterichtlijnen van de schrijfwijzer:
- Schrijf alsof je de woning zelf net hebt bezocht en niet kunt wachten om het iedereen te vertellen: uitbundig, warm, energiek en positief. Glimlach hoorbaar in elke zin.
- Gebruik veel uitroeptekens (gemiddeld in elke tweede of derde zin) en af en toe een enthousiaste vraag ("Zie jij jezelf hier al op zondagochtend ontbijten?").
- Spreek de lezer direct en persoonlijk aan in de je-vorm; maak het levendig met concrete momenten uit het dagelijks leven (koffie in de tuin, kinderen die buiten spelen, vrienden over de vloer) — zonder feiten te verzinnen.
- Korte, speelse zinnen afgewisseld met uitroepen als "Wat een plek!", "Hoe fijn is dát?", "En het wordt nog beter:".
- Gebruik woorden als heerlijk, zonnig, superfijn, fantastisch, genieten, knus, dolblij, vrolijk — dit mag hier nadrukkelijk, ook als de schrijfwijzer zulke woorden afraadt.
- Geen emoji's (die zijn technisch niet toegestaan), wel volop uitroeptekens.
- Lengte: volg de richtlijn van de schrijfwijzer.
- Social media: barstend van enthousiasme, met een vrolijke uitnodiging om snel te komen kijken.$w$, 2),
    (p_org, 'Anne-Louise', 'Anne-Louise – heel wollig', 'Lange, beeldende, omfloerste zinnen', $w$Schrijfstijl "Anne-Louise – heel wollig". Deze stijl gaat VOOR de toon- en lengterichtlijnen van de schrijfwijzer:
- Schrijf uitgesproken literair, omfloerst en beschouwend, alsof een woonmagazine een essay over deze woning publiceert. Lange, slingerende zinnen van gemiddeld 30–45 woorden met bijzinnen, uitweidingen en gedachtestreepjes.
- Stapel bijvoeglijke naamwoorden en beeldspraak ("een woning die als een zacht gedicht in het straatbeeld rust", "waar het licht als een trage rivier over de vloerdelen stroomt"). Gebruik woorden als allure, sereniteit, cachet, harmonie, nonchalante elegantie, tijdloze grandeur, ongedwongen verfijning, zinnenprikkelend.
- Benader feiten zijdelings en omschrijvend in plaats van direct: noem ze wel (alle feiten blijven correct en volledig), maar verpak ze in sfeer en beschouwing.
- Begin de introductie met een beschouwende openingszin over wonen, tijd, licht of de buurt voordat de woning zelf ter sprake komt.
- Gebruik de "u"-vorm of een afstandelijke derde persoon ("de toekomstige bewoner zal ontdekken dat…") in plaats van de je-vorm. Geen uitroeptekens.
- Clichés en formuleringen uit "Te vermijden" in de schrijfwijzer zijn in deze stijl toegestaan.
- Lengte: ruim anderhalf keer de richtlijn; Funda circa 1.000–1.400 woorden, website circa 500–650, Facebook circa 150–200, Instagram circa 100–140.
- Social media: dromerig en beschouwend, met een omfloerste uitnodiging om de woning te komen ervaren.$w$, 3)
  on conflict (organization_id, name) do nothing;
$$;
revoke all on function private.seed_writing_styles(uuid) from public, anon, authenticated;

select private.seed_writing_styles(o.id) from public.organizations o;

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
  perform private.seed_writing_styles(v_org);
  return v_org;
end;
$$;
revoke all on function private.bootstrap_organization(text, text) from public, anon, authenticated;

-- Woning: gekozen makelaar/schrijfstijl (standaard voor generaties van deze woning).
-- Samengestelde FK: een stijl van een andere organisatie kan nooit worden gekoppeld.
alter table public.properties add column writing_style_id uuid;
alter table public.properties
  add constraint properties_writing_style_fk foreign key (writing_style_id, organization_id)
  references public.writing_styles (id, organization_id) on delete set null (writing_style_id);
