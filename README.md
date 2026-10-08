# Korff de Gidts | Woningtekst Studio

Interne webapplicatie waarmee medewerkers van Korff de Gidts NVM Makelaardij woninggegevens vastleggen, bronnen controleren en met Claude acht woningteksten laten schrijven, vertalen, controleren, bewerken en goedkeuren:

| Kanaal | Nederlands | Engels | Extra |
|---|---|---|---|
| Funda | ✓ | ✓ | vaste structuur + letterlijke NVM-passages |
| Website | ✓ | ✓ | SEO-titel, metaomschrijving, slug |
| Facebook | ✓ | ✓ | 4–6 hashtags |
| Instagram | ✓ | ✓ | 5–8 hashtags |

## Belangrijkste functies

- **Woningen**: dashboard met kerncijfers, zoeken, filteren, sorteren; formulier met zeven secties en automatische tussentijdse opslag.
- **Snelle invoer**: verkoopdossier uploaden of omschrijving plakken; Claude structureert de gegevens met bron, citaat en betrouwbaarheid. Tegenstrijdige bronnen worden zichtbaar gemaakt; de medewerker kiest altijd zelf.
- **Tekstgeneratie** in hervatbare stappen (analyse → Nederlands → Engels → SEO/hashtags → controle → opslaan), met automatische eindcontrole (clichés, emoji's, privacy, prijs op social, NL/EN-cijfers).
- **Editor** per tekst: kopiëren, opslaan, opnieuw genereren, korter/uitgebreider/zakelijker/persoonlijker/natuurlijker, versiegeschiedenis en herstel, "Controleer deze tekst" met accepteren/negeren, indienen en goedkeuren.
- **Schrijfwijzer** met versiebeheer; elke tekstversie registreert de schrijfwijzer- en promptversie. Voorbeelddocument laten analyseren tot een voorstel voor een nieuwe versie.
- **Beheer**: gebruikers uitnodigen en rollen beheren, AI-budgetten en rate limits, goedkeuringsrollen, bewaarbeleid, auditlog, AI-verbruik en -kosten.

## Techniek

Next.js 16 (App Router, TypeScript strict) · React 19 · Tailwind CSS 4 · shadcn/ui · TipTap · React Hook Form · Zod · Supabase (PostgreSQL 17, Auth, Storage, RLS) · Anthropic Claude API (`claude-opus-5-5`, structured outputs) · Vitest · Playwright · GitHub Actions · Vercel.

## Snel starten (lokaal)

Vereist: Node.js 22, Docker, de Supabase CLI (`npx supabase`).

```bash
npm ci
npx supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,supavisor,postgres-meta,mailpit
node scripts/local-setup.mjs --schrijf-env   # fictieve organisaties, gebruikers en schrijfwijzer; schrijft .env.local
npm run dev                                    # http://localhost:3000
```

Inloggen met bijvoorbeeld `makelaar@example.test` / `Testwachtwoord123` (ook `admin@`, `redacteur@`, `admin-b@` voor een tweede organisatie). Lokaal staat `AI_MOCK=true`: AI-antwoorden zijn deterministisch en gratis. Zet voor echte teksten `AI_MOCK=false` en een `ANTHROPIC_API_KEY` in `.env.local`.

## Testen

```bash
npm run typecheck && npm run lint
npm test                 # unit-tests
npm run test:db          # database-/RLS-securitytests (PostgreSQL; zie DATABASE.md)
npx vitest run --project integratie   # pipeline tegen lokale Supabase
npx playwright test      # E2E (lokale Supabase + dev-server)
RUN_LIVE_AI=1 ANTHROPIC_API_KEY=... npx vitest run tests/integration/claude-live.test.ts   # optioneel, kostenbegrensd
```

## Documentatie

- [ARCHITECTURE.md](ARCHITECTURE.md) — opbouw, datastromen, AI-pipeline
- [DATABASE.md](DATABASE.md) — schema, RLS, RPC's, migraties
- [SECURITY.md](SECURITY.md) — maatregelen, bevindingen en uitgevoerde tests
- [PRIVACY.md](PRIVACY.md) — AVG: gegevens, doelen, verwerkers, bewaartermijnen
- [DEPLOYMENT.md](DEPLOYMENT.md) — Supabase, Vercel, omgevingen, livegang
- [content/schrijfwijzer/v1.md](content/schrijfwijzer/v1.md) — schrijfwijzer (versie 1) en [bronreferenties](content/schrijfwijzer/BRONNEN.md)

## Mappenstructuur

```
src/app/                 Pagina's (App Router), server actions en API-routes
  (auth)/                inloggen, wachtwoord, registreren
  (app)/                 dashboard, woningen, schrijfwijzer, instellingen, gebruikers
  api/                   uploads, extractie, generatie, tekstacties (JSON, same-origin)
src/components/          UI (shadcn/ui), formulier, editor, bronnen, beheer
src/lib/
  ai/                    Claude-transport, prompts, schema's, mock, PII, prijzen
  pipeline/              jobs, generatie, enkele tekst, extractie
  content/               HTML/sanitisatie, schrijfwijzer-parser, eindcontrole
  domain/                velddefinities (7 secties), mapping, broncontrole
  data/, auth/, supabase/  data-toegang, sessie/rollen, clients
supabase/migrations/     versiebeheerde SQL-migraties (schema, RLS, RPC's, storage)
content/schrijfwijzer/   schrijfwijzer v1 en bronreferenties
tests/                   unit, integratie, db (RLS) en e2e
scripts/local-setup.mjs  lokale testdata (alleen fictief)
```

> TanStack Query is bewust niet gebruikt: data wordt server-side geladen (Server Components) en na mutaties ververst via `router.refresh()`; jobvoortgang wordt door de client zelf aangestuurd. Een extra cachelaag zou hier alleen complexiteit toevoegen.
