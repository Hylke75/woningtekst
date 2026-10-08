# Privacy en AVG

Verwerkingsverantwoordelijke: Korff de Gidts NVM Makelaardij. Dit document beschrijft de verwerkingen door Woningtekst Studio en is input voor het verwerkingsregister en eventuele DPIA. Het is geen juridisch advies; laat de inhoud toetsen door de functionaris/adviseur gegevensbescherming.

## Welke gegevens worden opgeslagen

| Categorie | Gegevens | Waar |
|---|---|---|
| Medewerkers | naam, e-mailadres, rol, actief, inlogsessies | `profiles`, `organization_memberships`, Supabase Auth |
| Woningdossiers | adres, kenmerken, prijs, juridische en technische gegevens, positionering, publicatie (incl. contactpersoon van kantoor) | `properties` |
| Bronbestanden | geüploade verkoopdossiers, meetrapporten, plattegronden, foto's, energielabels, VvE-stukken (kunnen persoonsgegevens van verkopers bevatten) | private bucket `property-documents` + `property_documents` |
| Brongegevens | door AI of mens uit bronnen gehaalde woninggegevens met citaat | `property_facts` |
| Teksten | alle versies van de acht teksten, SEO, hashtags, goedkeuringen | `content_versions` |
| Controle en verantwoording | controlepunten, generatietaken, AI-verbruik (tokens, kosten), auditlog (acties, geen inhoud) | `review_issues`, `generation_jobs`, `ai_usage_events`, `audit_logs` |

## Waarom (doelen en grondslag)

- Opstellen, controleren en publiceren van woningpresentaties ten behoeve van de verkoopopdracht (uitvoering overeenkomst met de opdrachtgever; gerechtvaardigd belang).
- Kwaliteitsborging en verantwoording: versiegeschiedenis, goedkeuringen, auditlog (gerechtvaardigd belang; aantoonbaarheid).
- Kostenbeheersing en misbruikpreventie: AI-verbruik per gebruiker (gerechtvaardigd belang).

## Externe verwerkers

| Verwerker | Doel | Locatie | Opmerking |
|---|---|---|---|
| Supabase | database, authenticatie, opslag | EU (projectregio Ierland, `eu-west-1`) | verwerkersovereenkomst (DPA) afsluiten |
| Vercel | hosting van de applicatie | functies in EU-regio te configureren (zie DEPLOYMENT.md) | DPA; logbewaring beperken |
| Anthropic | tekstgeneratie en extractie (Claude API) | VS | DPA + passende doorgiftewaarborgen; API-gegevens worden niet voor training gebruikt; standaard 30 dagen bewaard voor misbruikmonitoring tenzij anders overeengekomen |

## Welke gegevens gaan naar Claude

- **Tekstgeneratie**: het woningprofiel (secties 1–6), **zonder** telefoonnummer en e-mailadres uit de publicatiegegevens, plus de schrijfwijzer en (bij latere stappen) de door Claude zelf gegenereerde teksten.
- **Extractie**: de tekst van het gekozen document of de geplakte tekst, **na maskering** van namen (met aanspreekvorm of label zoals "Verkoper:"), e-mailadressen, telefoonnummers, IBAN, BSN (11-proef) en geboortedata; contactgegevens van kantoor blijven staan. Afbeeldingen (plattegrond, energielabel) worden als afbeelding verstuurd met de instructie geen persoonsgegevens over te nemen.
- **Schrijfwijzer-analyse**: het voorbeelddocument na maskering; het bestand wordt niet opgeslagen.
- Nooit: inloggegevens, gegevens van andere woningen, auditlogs, documenten die niet expliciet voor analyse zijn gekozen.

De maskering is patroongebaseerd (best effort). Daarom: (1) upload alleen documenten die nodig zijn, (2) de eindcontrole controleert gegenereerde teksten op e-mailadressen, telefoonnummers en "niet te noemen" onderwerpen, (3) teksten worden altijd door een medewerker goedgekeurd.

## Voorkomen dat persoonsgegevens in teksten belanden

- Systeeminstructies verbieden het noemen van namen en contactgegevens van verkopers, kopers, huurders en buren.
- "Bekende gebreken", "Verkoopclausules" en "Zaken die niet genoemd mogen worden" worden alleen gebruikt om onjuiste claims te voorkomen.
- Deterministische controle op onbekende e-mailadressen/telefoonnummers (kritiek controlepunt) en op niet-te-noemen onderwerpen.

## Inzicht

Op het tabblad **Bronnen en controle** (en in sectie 7 van het formulier) ziet de medewerker altijd alle aan een woning gekoppelde documenten, met type, grootte, uploaddatum en analysestatus; downloaden gaat via een kortlevende link en wordt gelogd.

## Bewaren en verwijderen

| Gegevens | Termijn | Hoe |
|---|---|---|
| Woningdossier (incl. bestanden, feiten, teksten, jobs, controlepunten) | standaard 24 maanden na verkoop/intrekking; inactieve concepten 12 maanden (configureerbaar onder Instellingen) | administrator verwijdert definitief via "Dossier definitief verwijderen" na controle van wettelijke bewaarplichten; de applicatie verwijdert nooit automatisch |
| Gearchiveerde dossiers | na 30 dagen voorgesteld voor definitieve verwijdering | idem |
| Losse documenten | tot verwijdering door makelaar/admin | verwijdert bestand én afgeleide brongegevens |
| Auditlog | onbeperkt binnen de organisatie (append-only); bevat geen inhoud of adressen, alleen acties, ID's en gewijzigde kolomnamen | bij opheffen organisatie |
| AI-verbruik | blijft na dossierverwijdering bestaan (kostenverantwoording), zonder inhoud | bij opheffen organisatie |
| Medewerkersaccount | tot verwijdering | account verwijderen in Supabase Auth; teksten en goedkeuringen blijven bestaan, de koppeling naar de persoon vervalt (getest) |

**Wettelijke bewaarplichten**: controleer vóór definitieve verwijdering o.a. de fiscale bewaarplicht (7 jaar) voor administratieve stukken en eventuele Wwft-verplichtingen. Bewaar die stukken in het daarvoor bestemde systeem; Woningtekst Studio is geen archiefsysteem.

## Rechten van betrokkenen

Verzoeken (inzage, correctie, verwijdering) worden door een administrator afgehandeld: woninggegevens en teksten zijn per dossier in te zien en te corrigeren; een dossier of document kan definitief worden verwijderd. Voor gegevens bij Anthropic geldt de bewaartermijn van de verwerkersafspraken.
