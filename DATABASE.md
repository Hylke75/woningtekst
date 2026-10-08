# Database

Supabase PostgreSQL 17. Alle wijzigingen via versiebeheerde migraties in `supabase/migrations/` (nooit via applicatiecode).

| Migratie | Inhoud |
|---|---|
| `20261008090000_core_schema.sql` | enums, organisaties, instellingen, profielen, lidmaatschappen, uitnodigingen, private helperfuncties |
| `20261008090100_domain_tables.sql` | schrijfwijzers, woningen, documenten, jobs, feiten, tekstversies, controlepunten, AI-verbruik, auditlog, indexen |
| `20261008090200_security_rls_rpc.sql` | server-geheim, audit-triggers, guard-triggers, auth-koppeling, RLS-policies, rechten, RPC's |
| `20261008090300_storage_views_retention.sql` | private bucket + storage-policies, `property_overview`, bewaarbeleid, bootstrap |
| `20261008090400_patch_property.sql` | atomische autosave (`patch_property`), controlemarkering |
| `20261008090500_email_domains.sql` | toegang op e-maildomein (`organization_email_domains`, standaardrol), aangepaste `handle_auth_user` |
| `20261009100000_mfa.sql` | twee-stapsverificatie: `private.jwt_aal`, `private.has_verified_factor`, `private.mfa_ok`; helpers `is_member`/`has_role`/`can_approve`/`current_org_id`/`current_role` vereisen aal2 bij een geverifieerde factor, en `has_role` met uitsluitend `admin` altijd aal2; RPC `mfa_status()` |

## Entiteiten

```
organizations 1─1 organization_settings
organizations 1─* organization_memberships *─1 profiles 1─1 auth.users
organizations 1─* invitations
organizations 1─* style_guides (versie, is_active: max. één actief)
organizations 1─* properties 1─* property_documents 1─* property_facts
                             1─* generation_jobs
                             1─* content_versions (kanaal × taal × versie)
                             1─* review_issues
organizations 1─* ai_usage_events, audit_logs
```

- **Toegang**: via persoonlijke uitnodiging of via een gekoppeld e-maildomein (standaardrol per domein). Lidmaatschap ontstaat pas na bevestiging van het e-mailadres; een uitnodiging gaat voor de domeinregel. Ontkoppelen van een domein laat bestaande leden staan.
- **Gezaghebbende bron voor rollen**: `organization_memberships(organization_id, user_id, role, is_active)`, uniek per gebruiker. `profiles` bevat bewust géén `organization_id`/`role` (voorkomt inconsistentie); de applicatie leest de rol altijd uit het lidmaatschap.
- **Woningen**: sectie 1 in kolommen; secties 2–4 in `facts_json` (`kenmerken`, `locatie`, `juridisch`), sectie 5 in `positioning_json`, sectie 6 (incl. publicatielinks, contact, hashtags, prijs op social) in `publication_json`. Validatie in de applicatie (Zod, `src/lib/domain/property-fields.ts`), groottelimieten en types in de database.
- **Feiten** (`property_facts`): waarde, bron (document/geplakte tekst/handmatig), bronlocatie, citaat, betrouwbaarheid, status (onbevestigd/bevestigd/conflict/afgewezen), wie/wanneer bevestigd.
- **Tekstversies** (`content_versions`): append-only; status concept → ter_controle → goedgekeurd; SEO-velden alleen bij `website` (constraint); hashtags per versie; herleidbaar naar job, schrijfwijzer(versie), promptversie, basisversie en auteur.
- **Jobs** (`generation_jobs`): type, status, stappen (tussenresultaten), pogingen, input-hash, idempotency key (uniek per organisatie), tokens en kosten. Partiële unieke index: max. één actieve volledige generatie per woning.
- **AI-verbruik** (`ai_usage_events`): per aanroep model, tokens, kosten, status, foutcode, duur; zonder FK naar woning zodat kostenverantwoording een dossierverwijdering overleeft.

## RLS (samenvatting)

| Tabel | Lezen | Schrijven |
|---|---|---|
| organizations, settings | leden | admin (update) |
| profiles | zichzelf + collega's | eigen naam |
| memberships | leden | alleen via `admin_update_member` / uitnodiging |
| invitations | admin | via `admin_create_invitation` / `admin_revoke_invitation` |
| organization_email_domains | admin | via `admin_set_email_domain` / `admin_remove_email_domain` |
| style_guides | leden | via `publish_style_guide` / `activate_style_guide` (admin) |
| properties | leden | admin, makelaar (insert/update; archiveren alleen admin; verwijderen via `purge_property`) |
| property_documents, property_facts | leden | admin, makelaar |
| generation_jobs | leden | insert afhankelijk van jobtype en rol; updates alleen via server-RPC |
| content_versions | leden | insert alle rollen (via `save_content_version`); status via `set_content_status` |
| review_issues | leden | insert/afhandelen door leden |
| ai_usage_events | admin alles, anderen eigen | alleen via server-RPC |
| audit_logs | admin | alleen triggers/RPC (append-only) |
| storage.objects (`property-documents`) | leden met woning in pad | upload/verwijderen: admin, makelaar; geen update |

## RPC's

| Functie | Doel | Beveiliging |
|---|---|---|
| `save_content_version` | nieuwe tekstversie met conflictdetectie | invoker (RLS), advisory lock |
| `set_content_status` | indienen/goedkeuren/intrekken | definer; rol + goedkeuringsrollen; legt `auth.uid()` vast |
| `patch_property`, `mark_property_checked` | autosave, controle | invoker (RLS), kolom-whitelist |
| `publish_style_guide`, `activate_style_guide` | schrijfwijzerversies | definer; admin |
| `admin_create_invitation`, `admin_revoke_invitation`, `admin_update_member` | gebruikersbeheer | definer; admin; niet zichzelf; ≥1 admin |
| `admin_set_email_domain`, `admin_remove_email_domain` | toegang op domein | definer; admin; geen publieke maildomeinen; domein hoort bij één organisatie |
| `purge_property` | dossier definitief verwijderen | definer; admin; eerst documenten |
| `retention_candidates` | bewaarbeleid | invoker; admin |
| `log_event` | applicatie-auditregels | definer; eigen organisatie |
| `server_ai_reserve`, `server_ai_finish`, `server_job_claim`, `server_job_update` | quota, kosten, jobs | definer; vereist `SERVER_RPC_SECRET` |
| `cancel_generation_job` | annuleren | definer; aanvrager of admin |
| `mfa_status` | heeft de aanroeper een geverifieerde MFA-factor + huidig `aal` | definer; alleen eigen gegevens; niet voor `anon` |

## Lokaal testen

- **RLS-tests zonder Docker**: een gewone PostgreSQL (16+) met `supabase/tests/supabase-shim.sql` (rollen, `auth.uid()`, minimale `auth`/`storage`). `TEST_DATABASE_URL` wijst naar de server; `npm run test:db` maakt een verse database en past alle migraties toe.
- **Volledige stack**: `npx supabase start` past de migraties toe; `node scripts/local-setup.mjs` voegt fictieve testdata toe.

## Typen

`src/lib/db-types.ts` bevat rijtypen die met de migraties overeenkomen. Na koppeling van het productieproject kunnen gegenereerde typen worden toegevoegd met `npx supabase gen types typescript --project-id <ref>`.

## Bootstrap productie

```sql
-- Eénmalig, als database-eigenaar (SQL-editor of MCP), niet via de API:
select private.bootstrap_organization('Korff de Gidts NVM Makelaardij', '<e-mailadres eerste administrator>');
insert into private.server_secrets (name, secret_hash)
values ('server_rpc', encode(sha256(convert_to('<SERVER_RPC_SECRET>', 'UTF8')), 'hex'));
```
Daarna registreert de eerste administrator zich met dat e-mailadres en activeert onder Schrijfwijzer de standaardschrijfwijzer.
