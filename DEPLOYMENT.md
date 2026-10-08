# Deployment

## Status bij oplevering

| Onderdeel | Status |
|---|---|
| GitHub-repository `Hylke75/woningtekst` | bijgewerkt (branch `claude/gracious-allen-575elw`), CI-workflow aanwezig |
| Lokale volledige stack (Supabase CLI + Docker) | werkend; alle migraties, integratie- en E2E-tests geslaagd |
| Supabase-productieproject | **ingericht**: `korff-woningtekst-studio` (ref `zviyywxjokjspovpkiku`, regio eu-west-1 Ierland). Alle 5 migraties toegepast (checksums gecontroleerd), organisatie aangemaakt met uitnodiging voor de eerste administrator, Advisors gecontroleerd (alleen bewuste RPC-meldingen). Server-geheim (hash) en Auth-instellingen: zie stap 1.3–1.4. |
| Vercel-project | **live**: https://korff-woningtekst-studio.vercel.app (project `korff-woningtekst-studio`, gekoppeld aan `Hylke75/woningtekst`, productiebranch `main`, functies in fra1). Environment variables gezet, security headers en doorverwijzing van niet-ingelogde gebruikers gecontroleerd op 8 oktober 2026. |
| Anthropic API-sleutel | door de eigenaar zelf in Vercel gezet (Sensitive); controleer onder Instellingen › Configuratie of Claude "Gekoppeld" toont. Stel bij Anthropic een maandlimiet in. |
| Voorbeelddocument `Korff-de-Gidts-woningomschrijvingen.docx` | **blocker**: niet aangetroffen in repository of Google Drive; analyseer het na livegang via Schrijfwijzer › Voorbeelden analyseren. |

## 1. Supabase

1. Maak in de Supabase-organisatie een nieuw project **`korff-woningtekst-studio`**, regio **eu-central-1 (Frankfurt)**. Gebruik bij voorkeur een apart project voor preview/test.
2. Migraties toepassen (vanaf deze repository):
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push            # past supabase/migrations/* toe
   ```
3. Bootstrap (SQL-editor, als eigenaar):
   ```sql
   select private.bootstrap_organization('Korff de Gidts NVM Makelaardij', '<e-mailadres eerste administrator>');
   insert into private.server_secrets (name, secret_hash)
   values ('server_rpc', encode(sha256(convert_to('<SERVER_RPC_SECRET>', 'UTF8')), 'hex'));
   ```
   `SERVER_RPC_SECRET` genereren met `openssl rand -hex 32`; dezelfde waarde gaat naar Vercel.
4. Authentication-instellingen:
   - Site URL = productie-URL; Redirect URLs = `https://<domein>/auth/callback**` (+ preview-domeinen).
   - **Confirm email: aan** (vereist: toegang ontstaat pas na bevestiging van het uitgenodigde adres).
   - Minimale wachtwoordlengte 12, vereiste tekens: kleine letters, hoofdletters, cijfers; leaked-password-protectie aan.
   - SMTP instellen met een eigen afzender (de standaard Supabase-mail is beperkt).
5. Controleer **Advisors** (security en performance) in het dashboard.
6. Sluit de verwerkersovereenkomst (DPA) af (zie PRIVACY.md).

## 1b. E-mail via Resend (alle auth-mails)

Alle mails (bevestiging, uitnodiging, wachtwoordherstel, e-mailwijziging) verstuurt Supabase Auth. Die gaan via Resend door Supabase Auth op SMTP te zetten; de applicatie zelf verstuurt geen mail.

1. In Resend is het verzenddomein **`mail.korffdegidts.nl`** (regio eu-west-1, TLS enforced, geen tracking) aangemaakt. Een subdomein laat de bestaande mailinstellingen (SPF/DMARC) van korffdegidts.nl ongemoeid.
2. DNS van korffdegidts.nl staat bij **Realworks** (ns1/ns2.realworks.nl). Laat daar deze records toevoegen (namen relatief aan `korffdegidts.nl`):

| Type | Naam | Waarde | Prioriteit |
|---|---|---|---|
| TXT | `resend._domainkey.mail` | DKIM-sleutel uit het Resend-dashboard (Domains › mail.korffdegidts.nl) | |
| MX | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | |
| CNAME | `rsend.mail` | `send.forge.rmta.net` | |

3. Pas als Resend het domein als **verified** toont: Supabase › Authentication › Emails › SMTP Settings:
   host `smtp.resend.com`, poort `465`, gebruikersnaam `resend`, wachtwoord = een Resend API-sleutel met alleen verzendrechten voor `mail.korffdegidts.nl`, afzender `woningtekst@mail.korffdegidts.nl`, naam "Korff de Gidts Woningtekst Studio". Verhoog daarna onder Rate Limits het aantal e-mails per uur (bijv. 100).
   Zet SMTP niet eerder om: met een niet-geverifieerd domein mislukken alle auth-mails.
4. E-mailtemplates (Nederlands) gebruiken `token_hash`-links naar `/auth/callback`, zodat links ook op een ander apparaat werken:
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=<signup|invite|recovery|email_change|magiclink>`.

## 2. Vercel

1. Importeer `Hylke75/woningtekst` als nieuw project **`korff-woningtekst-studio`** (Framework: Next.js; `vercel.json` zet functies in **fra1**). Zorg dat de Vercel GitHub-app toegang heeft tot de repository.
2. Productiebranch: na review de branch mergen naar `main` en `main` als productiebranch instellen.
3. Environment Variables (zie `.env.example`):

| Variabele | Production | Preview | Development | Type |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod-project | test-project | lokaal | plain |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod | test | lokaal | plain |
| `NEXT_PUBLIC_APP_URL` | productie-URL | (leeg: afgeleid uit host) | `http://localhost:3000` | plain |
| `SERVER_RPC_SECRET` | uniek | uniek (ander dan prod) | lokaal | **sensitive** |
| `ANTHROPIC_API_KEY` | ja | eigen sleutel met lage limiet | optioneel | **sensitive** |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | idem | idem | plain |
| `ANTHROPIC_EFFORT` | `medium` | `low` | `medium` | plain |
| `SUPABASE_SECRET_KEY` | optioneel (uitnodigingsmails) | liever niet | nee | **sensitive** |
| `AI_MOCK` | **niet zetten** (wordt in productie geweigerd) | optioneel `true` | `true` | plain |

   Nooit geheimen in `NEXT_PUBLIC_*`.
4. **Preview-deployments veilig**: Deployment Protection (Vercel Authentication) aan voor previews; previews wijzen naar het test-Supabase-project, nooit naar productie.
5. Plan: AI-routes gebruiken `maxDuration = 300` (Fluid Compute). Controleer dat het plan dit toestaat.

## 3. Verificatie na deployment

- `/inloggen` laadt; niet-ingelogd `/dashboard` → doorverwijzing.
- Eerste administrator registreert zich (`/registreren`) met het bootstrap-adres, bevestigt de e-mail en heeft dan toegang.
- Schrijfwijzer › "Standaardschrijfwijzer activeren".
- Instellingen › Configuratie toont "Claude: Gekoppeld" en het model.
- Woning aanmaken, gegevens controleren, één generatie draaien; Instellingen › AI-verbruik toont kosten.
- Security headers controleren (bijv. `curl -I`), en Supabase Advisors opnieuw draaien.

## 4. Omgevingen

| Omgeving | Supabase | AI | Doel |
|---|---|---|---|
| Lokaal | `supabase start` + `scripts/local-setup.mjs` | mock (of eigen sleutel) | ontwikkeling, E2E |
| CI | `supabase start` in GitHub Actions | mock | alle tests |
| Preview (Vercel) | apart testproject | echte sleutel met lage limiet of mock | review |
| Productie (Vercel) | productieproject EU | echte sleutel | gebruik |

## 5. Testen

```bash
npm run typecheck && npm run lint && npm test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db
npx supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,supavisor,postgres-meta,mailpit
node scripts/local-setup.mjs --schrijf-env
npx vitest run --project integratie
npx playwright test
RUN_LIVE_AI=1 ANTHROPIC_API_KEY=... npx vitest run tests/integration/claude-live.test.ts   # kostenbegrensd
```
