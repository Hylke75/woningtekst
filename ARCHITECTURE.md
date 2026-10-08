# Architectuur

## Overzicht

```
Browser (React 19, Next.js client components)
   │  Server Actions (formulieren, status)       JSON-routes /api/* (uploads, AI)
   ▼                                              ▼
Next.js 16 op Vercel (Node.js runtime)  ──────────────────────────────┐
   │  proxy.ts: sessie verversen, niet-ingelogd → /inloggen          │
   │  Data Access Layer: getClaims() + lidmaatschap (rol, organisatie)│
   │  Supabase-client met publishable key + JWT van de gebruiker     │
   ▼                                                                  ▼
Supabase (EU)                                                  Anthropic Claude API
   PostgreSQL 17 + RLS (default deny)                          structured outputs (JSON Schema)
   RPC's (security definer, server-geheim voor kosten/jobs)    adaptive thinking, effort
   Storage: private bucket property-documents                  server-side fallback bij weigering
   Auth: e-mail/wachtwoord, uitnodigingen, TOTP-MFA (verplicht voor admins)
```

### Kernprincipes

1. **Database als beveiligingsgrens.** Alle gebruikersqueries lopen met het JWT van de gebruiker; RLS bepaalt welke rijen zichtbaar of schrijfbaar zijn. Server-code controleert rollen óók vooraf (betere foutmeldingen), maar is nooit de enige grens.
2. **Eén gezaghebbende bron voor rollen**: `organization_memberships` (organisatie + rol + actief). `profiles` bevat alleen weergavegegevens.
3. **Geen service-role key in het verzoekpad.** Geprivilegieerde server-acties (AI-verbruik registreren, jobstatus bijwerken) gebruiken RPC's die een server-geheim vereisen; alleen de SHA-256-hash staat in de database. Zo kan een ingelogde gebruiker via de Data API geen kosten of jobstatussen manipuleren. De optionele `SUPABASE_SECRET_KEY` wordt uitsluitend voor uitnodigingsmails gebruikt.
4. **Append-only teksten.** Elke wijziging is een nieuwe `content_versions`-rij; alleen status/indiening/goedkeuring kan via RPC wijzigen. Versienummers worden in de database bepaald onder een advisory lock; optimistische concurrency (`expected_version`) voorkomt stil overschrijven.
5. **Twee-stapsverificatie (TOTP).** Wie een factor heeft, komt pas na de code verder (`/inloggen/verificatie`); administrators gebruiken beheerrechten alleen met een aal2-sessie. Beslislogica in `src/lib/auth/mfa.ts` (puur), afgedwongen in `session.ts` én in de database-helpers (migratie `20261009100000_mfa.sql`).
6. **Mens beslist.** AI-gegevens zijn altijd "onbevestigd"; conflicterende bronnen worden "conflict" tot een medewerker kiest. Generatie start pas na expliciete menselijke controle van de gegevens.

## Datastromen

### Woninggegevens en autosave
Formulier (React Hook Form) → debounce 1,2 s → Server Action `savePropertyFields` → Zod-validatie per veld (strikt schema, onbekende sleutels geweigerd) → RPC `patch_property` (kolom-whitelist; JSON-secties per sleutel samengevoegd in één UPDATE) → zet `data_checked_at` terug (nieuwe controle vereist) → conflicten herberekend. Velden zijn pas bewerkbaar na hydratie; niet-opgeslagen wijzigingen geven een waarschuwing bij verlaten.

### Uploads
1. `POST /api/woningen/:id/documenten/upload-url` — rol, type, grootte (afbeeldingen ≤ 5 MB i.v.m. Claude), aantal per woning; pad `org/woning/uuid.ext`; kortlevende signed upload-URL.
2. Browser uploadt rechtstreeks naar de private bucket (omzeilt de 4,5 MB-bodylimiet van Vercel).
3. `POST /api/woningen/:id/documenten` — download, controle op **werkelijke inhoud** (magic bytes), SHA-256, registratie; ongeldig → object direct verwijderd.
4. Downloads alleen via `GET /api/documenten/:id/download` → autorisatie → signed URL (standaard 120 s), gelogd.

### Extractie (snelle invoer)
Bron (document of geplakte tekst) → tekst uit PDF (unpdf) / DOCX (mammoth) / TXT, of afbeelding → **PII-maskering** (namen, e-mail, telefoon, IBAN, BSN, geboortedata) → Claude met vaste systeeminstructie, data tussen `<document>`-tags → Zod → alleen bekende, extraheerbare velden met geldige waarden → `property_facts` (waarde, bron, citaat, locatie, betrouwbaarheid) → conflictdetectie → lege velden voorgesteld (onbevestigd). Te lange bronnen worden expliciet gemeld, nooit stil afgekapt.

### Tekstgeneratie
```
POST /api/woningen/:id/generatie  (idempotency key; max. één actieve job per woning)
  └─ voorwaarden: verplichte velden, geen conflicten, gegevens gecontroleerd, actieve schrijfwijzer
POST /api/jobs/:id/verder  (één stap per verzoek, maxDuration 300 s)
  1 analyse      verkoopargumenten, doelgroep, toon, ontbrekende gegevens
  2 nederlands   Funda (gestructureerd), website, Facebook, Instagram
  3 engels       afzonderlijk geredigeerd, inhoudelijk gelijk
  4 seo          SEO NL/EN + hashtags per kanaal en taal (effort low)
  5 controle     AI-review (feiten, NL/EN, privacy, juridisch, stijl) + deterministische eindcontrole
  6 opslaan      8 versies (beschermde teksten overgeslagen tenzij gekozen) + controlepunten
```
- Elke stap claimt de job atomisch (`server_job_claim`), slaat het resultaat direct op en zet de job terug op "wachtrij". Na een fout of afgebroken verzoek gaat dezelfde job verder vanaf de mislukte stap; opgeslagen versies en controlepunten worden per job gededupliceerd.
- Hartslag + verloop (6 min) voorkomt eindeloos "bezig"; de interface toont "Onderbroken — hervatten". De client stopt na maximaal 20 stapverzoeken.
- Een input-hash (profiel + schrijfwijzer + keuzes) borgt dat alle stappen op dezelfde gegevens werken; gewijzigde gegevens → opnieuw starten.
- Funda-HTML wordt in code opgebouwd uit de gestructureerde output (koppen, opsomming, indeling per verdieping) en sluit af met de **letterlijke** NVM-passages uit de schrijfwijzer; clausules alleen als ze in het profiel staan.

### Enkele tekst
Opnieuw genereren, herschrijven (vijf modi) en "Controleer deze tekst" zijn elk één AI-aanroep in een eigen job met idempotency key. Herschrijven/hergenereren slaat een nieuwe versie op met `expected_version` (conflict als iemand intussen opsloeg). Tekstcontrole wijzigt niets; voorstellen zijn alleen toepasbaar als het fragment letterlijk in de tekst staat.

## AI-aanroep (`src/lib/ai/call.ts`)
1. `server_ai_reserve` (server-geheim): rate limit per minuut/dag per gebruiker, dag- en maandbudget organisatie, onder advisory lock; registreert "gestart".
2. Transport: Anthropic SDK, streaming + `finalMessage()`, `thinking: adaptive`, `output_config.effort` + JSON Schema, SDK-retries met backoff (3), timeout (standaard 240 s), optioneel server-side fallback bij een weigering.
3. Controle `stop_reason` (refusal, max_tokens), `JSON.parse`, Zod. Eén extra poging bij ongeldige output.
4. `server_ai_finish`: tokens en geschatte kosten (ook bij fouten) → opgeteld op de job.

Model en effort zijn configureerbaar (`ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, `ANTHROPIC_EXTRACTION_MODEL`). In tests vervangt `AI_MOCK=true` de transport door een deterministische mock (in productie geweigerd).

## Vercel-limieten
AI-routes hebben `maxDuration = 300` (Fluid Compute). Elke stap is één afgebakende Claude-aanroep; lange processen worden opgeknipt en de toestand staat in de database, zodat een afgebroken functie niets verliest. Er is bewust geen achtergrondwachtrij: de stappen worden door de ingelogde gebruiker aangestuurd en zijn hervatbaar.

## Belangrijke beslissingen
- **cacheComponents uit**: volledig geauthenticeerde, per-gebruiker dynamische app.
- **Eén organisatie per gebruiker** (unique op `user_id`): geen ambiguïteit over de actieve organisatie.
- **Samengestelde FK's** `(property_id, organization_id)` op alle kindtabellen: een rij kan nooit aan een woning van een andere organisatie hangen.
- **Geen automatische verwijdering**: het bewaarbeleid stelt kandidaten voor; een administrator beslist.
