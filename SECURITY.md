# Beveiliging

Dit document beschrijft de maatregelen, de uitgevoerde tests en de bevindingen. Kwetsbaarheden melden: neem rechtstreeks contact op met de applicatiebeheerder van Korff de Gidts (niet via een openbaar issue).

## Maatregelen (security by design)

| Eis | Maatregel | Waar |
|---|---|---|
| RLS op alle tabellen, default deny | RLS aan op alle 14 tabellen in `public`; `anon` heeft geen rechten; `authenticated` krijgt alleen expliciete tabelrechten; zonder policy geen toegang | `supabase/migrations/…_security_rls_rpc.sql` |
| Organisatie-isolatie | Policies op `organization_id` + lidmaatschap; samengestelde FK `(property_id, organization_id)` op alle kindtabellen; één organisatie per gebruiker | migraties 1–3 |
| Toegang op domein | Alleen na bevestiging van een adres op een door een admin gekoppeld domein; publieke maildomeinen geweigerd; domein aan één organisatie; uitnodiging gaat voor (6 tests in `rls.test.ts` › toegang op e-maildomein) | migratie 6 |
| Rolgebaseerde toegang | Rollen alleen in `organization_memberships`; policies en RPC's controleren `private.has_role` / `private.can_approve`; UI en server actions controleren dezelfde matrix (`src/lib/auth/permissions.ts`) | |
| Alle mutaties server-side geautoriseerd | Server Actions en API-routes roepen `requireSession(capability)` aan; de database dwingt daarnaast RLS/guards af | `src/lib/auth/session.ts` |
| Mass assignment | Guard-triggers zetten `organization_id`, `created_by`, `uploaded_by`, versienummers, goedkeurders e.d. server-side; `patch_property` gebruikt een kolom-whitelist; Zod `strictObject` weigert onbekende sleutels | migratie 3 en 5, `property-fields.ts` |
| Vervalste goedkeuring | Inserts zijn altijd "concept" zonder goedkeurder; goedkeuren alleen via `set_content_status` dat `auth.uid()` vastlegt en de goedkeuringsrollen controleert; tekstversies zijn onveranderlijk | `content_versions_guard`, `set_content_status` |
| Geen service-role key in browser | Browser gebruikt alleen de publishable key. Server gebruikt het JWT van de gebruiker; de optionele secret key alleen voor uitnodigingsmails, nooit in `NEXT_PUBLIC_*` | `src/lib/supabase/*` |
| Geen Anthropic-sleutel client-side | Claude wordt uitsluitend server-side aangeroepen (`server-only`) | `src/lib/ai/*` |
| Onbevoegde AI-kosten | AI-routes vereisen sessie + rol; jobs alleen door bevoegde rollen (RLS); kostenregistratie en jobstatus alleen via RPC's met server-geheim; quota (rate limit, dag/maand) vóór elke aanroep | `server_ai_reserve`, `call.ts` |
| Dubbelklikken | Idempotency keys (unieke index per organisatie), max. één actieve volledige generatie per woning, atomische job-claim | `generation_jobs`, `jobs.ts` |
| Veilige uploads | Private bucket; signed upload-URL voor vooraf bepaald pad; controle op werkelijke inhoud (magic bytes), type, grootte en aantal; bucket-limieten; ongeldige bestanden direct verwijderd; bestandsnamen opgeschoond | upload-routes, `validate.ts` |
| Geraden URL's | Bucket is privé; storage-policies controleren organisatie én woning in het pad; downloads alleen via kortlevende signed URL na autorisatie (120 s) | migratie 4 |
| Inputvalidatie | Zod op alle server-invoer (velden, API-bodies, AI-output), database-constraints als tweede laag | |
| XSS | Teksten worden bij opslaan én bij weergave gesaneerd (whitelist h2/h3/p/ul/ol/li/strong/em/br); AI-tekst wordt ge-escaped bij HTML-opbouw; React escapet overige output; CSP met per-request nonce | `html.ts`, `proxy.ts`, `lib/csp.ts` |
| CSRF | Server Actions: ingebouwde origin-controle van Next.js. JSON-routes: verplichte `Origin` gelijk aan host + `Sec-Fetch-Site`; cookies SameSite=Lax | `src/lib/api.ts` |
| Rate limiting en misbruik | Per gebruiker per minuut en per dag, per organisatie dag- en maandbudget (configureerbaar); Supabase Auth heeft eigen inlog-rate limits | `organization_settings` |
| Foutmeldingen | Vaste Nederlandse meldingen, geen stacktraces, SQL of sleutels; database-fouten vertaald | `src/lib/errors.ts` |
| Audit logging | Triggers op woningen, documenten, feiten, teksten, schrijfwijzer, lidmaatschappen, uitnodigingen, instellingen, jobs; daarnaast kopiëren, downloaden en definitief verwijderen. Append-only, alleen admins lezen | `private.audit_row` |
| Prompt injection | Vaste systeeminstructies met databegrenzing; documenten/profiel uitsluitend als gemarkeerde data in het user-bericht; output via JSON Schema + Zod (geen vrije acties); extractie alleen naar toegestane velden; AI-feiten nooit "bevestigd" | `prompts.ts`, `extraction.ts` |
| Open redirects | Alleen relatieve interne paden als doorstuurdoel | `redirect.ts` |
| Security headers | CSP (nonce, via proxy), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP; `poweredByHeader` uit; `Cache-Control: private, no-store` | `next.config.ts`, `proxy.ts` |

## Uitgevoerde verplichte securitytests

| # | Test (opdracht §13) | Waar | Resultaat |
|---|---|---|---|
| 1 | Gebruiker A kan geen woning van organisatie B ophalen | `tests/db/rls.test.ts` › organisatie-isolatie; `tests/e2e/02-properties.spec.ts` › andere organisatie | geslaagd |
| 2 | Gebruiker A kan geen tekst van B wijzigen | `rls.test.ts` › "gebruiker A kan geen tekst van B wijzigen of aanvullen" | geslaagd |
| 3 | Editor kan geen administratoractie uitvoeren | `rls.test.ts` › rollen; `tests/e2e/01-auth.spec.ts`; `04-texts.spec.ts` (API 403) | geslaagd |
| 4 | Vervalste property_id geeft geen toegang | `rls.test.ts`; `tests/e2e/07-api-security.spec.ts` (404) | geslaagd |
| 5 | Geen mass assignment van organization_id | `rls.test.ts` › mass assignment + autosave; unit `propertyPatchSchema` | geslaagd |
| 6 | Storage-objecten niet via geraden URL's | `rls.test.ts` › opslag; `07-api-security.spec.ts` › download andere organisatie | geslaagd |
| 7 | RLS isoleert bronbestanden, tekstversies en logs | `rls.test.ts` › "isoleert bronbestanden, tekstversies, verbruik en logs" | geslaagd |
| 8 | Onbevoegden veroorzaken geen AI-kosten | `rls.test.ts` › AI-kosten en quota; `tests/integration/pipeline.test.ts` › onbevoegden/budget | geslaagd |
| 9 | Prompt injection via documenten wijzigt systeeminstructies niet | `pipeline.test.ts` › extractie; unit `ai.test.ts` › prompts; `03-sources.spec.ts` | geslaagd |
| 10 | Browserrequest kan geen goedkeuring van een ander vervalsen | `rls.test.ts` › goedkeuring | geslaagd |

Daarnaast: anon-toegang, onveranderlijke tekstversies en auditlog, versieconflicten, bevestiging van feiten door mensen, documentpaden, rate limit, dagbudget, atomische job-claim, idempotency, CSRF (vreemde origin → 403), onvolledige/ongeldige invoer, foutmeldingen zonder interne details, XSS-sanitisatie, accountverwijdering zonder dataverlies.

Totaal bij oplevering: 47 database-/RLS-tests, 63 unit-tests, 7 integratietests, 22 E2E-tests — allemaal geslaagd. De live-test tegen de Claude API is niet uitgevoerd (geen API-sleutel beschikbaar; zie DEPLOYMENT.md).

## Controle van routes, actions en databasefuncties

- **API-routes** (`src/app/api/**`): alle via `route()` (origin-controle, veilige fouten) + `requireSession(capability)` + Zod; resource-ID's als UUID gevalideerd; toegang tot de resource via RLS (onbekend → 404).
- **Server Actions** (`actions.ts`): `runAction` + `requireSession(capability)` + Zod; geen vertrouwen op client-ID's zonder RLS.
- **Databasefuncties**: alle `security definer`-functies hebben `search_path = ''`, controleren zelf lidmaatschap/rol, en `execute` is ingetrokken voor `public`/`anon`. Server-RPC's vereisen het server-geheim. Helperfuncties staan in het niet-geëxposeerde schema `private`.

## Bevindingen tijdens de bouw (opgelost)

1. Accountverwijdering faalde door botsing van `ON DELETE SET NULL` met guard-triggers en check-constraints → guards staan wijzigingen in vertrouwde context zonder JWT toe; constraints aangepast; test toegevoegd.
2. Velden met een punt in de naam (secties 2–6) werden niet door autosave opgeslagen (React Hook Form interpreteert punten als paden) → veldnamen gecodeerd; E2E-test toegevoegd.
3. Invoer vóór hydratie kon met bestaande waarden worden samengevoegd → waarden in server-HTML, velden pas na hydratie bewerkbaar; formulier wordt na autosave niet meer opnieuw gemount.
4. Filterbalk kon een net gekozen filter terugdraaien (vertraagde zoekactie) → navigatiestatus centraal bijgehouden.
5. PII-maskering miste titels met hoofdletter en tussenvoegsels; telefoonregex at regeleinden → verbeterd en getest.
6. Hervatten na gewijzigde gegevens kon NL en EN op verschillende gegevens baseren → input-hash per stap gecontroleerd.

## Geaccepteerde restrisico's

- `npm audit --omit=dev`: 3 × moderate in `sprintf-js` via `argparse`, uitsluitend gebruikt door het command-line-programma van `mammoth` (`mammoth/bin`), niet door de bibliotheekfunctie `extractRawText`. Niet bereikbaar vanuit de applicatie. De `shadcn`-CLI-meldingen (`braces`/`micromatch`) betreffen alleen build-tijd (devDependency).
- CSP voor scripts is strikt: `script-src 'self' 'nonce-…' 'strict-dynamic'` met een per verzoek in `src/proxy.ts` gegenereerde nonce (geen `'unsafe-inline'`, geen `'unsafe-eval'` in productie). Alle pagina's renderen daarvoor dynamisch (`connection()` in de root-layout). Restrisico: `style-src` bevat nog `'unsafe-inline'`, omdat Radix UI, sonner en TipTap inline stijlen zetten die niet met een nonce kunnen worden toegestaan. Inline CSS kan geen code uitvoeren; mitigatie: strikte HTML-sanitisatie, `frame-ancestors 'none'`.
- PII-maskering is best effort (patronen). Mitigatie: privacycontrole op gegenereerde teksten, menselijke goedkeuring, geen opslag van ruwe documenttekst buiten de private bucket.
- De rol- en quotacontrole op AI-aanroepen gebruikt het JWT van de gebruiker; een ingelogde gebruiker met geldige rol kan binnen zijn quota AI-kosten maken. Dat is de bedoelde functionaliteit; limieten zijn configureerbaar.

## Productievereisten (zie DEPLOYMENT.md)

- Supabase Auth: e-mailbevestiging AAN (standaard op hosted Supabase), openbare registratie mag aan blijven omdat toegang alleen via uitnodiging ontstaat; minimale wachtwoordlengte 12 met letters en cijfers; leaked-password-protectie aan.
- `SERVER_RPC_SECRET` per omgeving uniek; alleen de hash in `private.server_secrets`.
- Preview-deployments met eigen (niet-productie) Supabase-project of beschermd met Vercel Deployment Protection.
