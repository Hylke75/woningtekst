import { z } from "zod";
import { FIELD_TIPS } from "@/lib/domain/field-tips";

/**
 * Centrale velddefinitie voor het woningprofiel (opdracht §5). Eén bron voor:
 *  - het invoerformulier (zeven secties, labels, toelichtingen, invoertypes);
 *  - server-side validatie (Zod);
 *  - AI-extractie (toegestane veldnamen en beschrijvingen);
 *  - broncontrole (property_facts.field_name).
 *
 * Opslag: sectie 1 in kolommen van `properties`; secties 2-4 in facts_json
 * (kenmerken/locatie/juridisch), sectie 5 in positioning_json, sectie 6 in
 * publication_json. Sectie 7 (documenten) staat in property_documents.
 */

export type FieldKind =
  | "text"
  | "textarea"
  | "integer"
  | "currency"
  | "select"
  | "boolean"
  | "url"
  | "email"
  | "tel"
  | "date"
  | "postcode"
  | "tags";

export type SectionId = "basis" | "kenmerken" | "locatie" | "juridisch" | "positionering" | "publicatie" | "documenten";

export type FieldDef = {
  /** Veldnaam zoals gebruikt in property_facts en de extractie, bv. "year_built" of "kenmerken.keuken". */
  key: string;
  section: Exclude<SectionId, "documenten">;
  label: string;
  kind: FieldKind;
  help?: string;
  /** Uitleg bij hover/focus (ⓘ); zie field-tips.ts. */
  tip?: string;
  placeholder?: string;
  options?: readonly string[];
  /** Kolomnaam in properties (alleen sectie 1). */
  column?: string;
  /** Verplicht vóór tekstgeneratie. */
  requiredForGeneration?: boolean;
  /** Mag door AI uit documenten worden geëxtraheerd. Positionering/publicatie niet. */
  extractable?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  maxLength?: number;
};

export const SECTIONS: { id: SectionId; title: string; description: string }[] = [
  { id: "basis", title: "Basisgegevens", description: "Adres, prijs, oppervlakten en indeling in cijfers." },
  { id: "kenmerken", title: "Woningkenmerken", description: "Ruimtes, afwerking, duurzaamheid en indeling per verdieping." },
  { id: "locatie", title: "Locatie", description: "Omgeving en voorzieningen. Noem alleen wat klopt en controleerbaar is." },
  { id: "juridisch", title: "Juridisch en technisch", description: "Eigendom, VvE, monumentstatus en voorwaarden. Wordt nooit aangevuld door AI." },
  { id: "positionering", title: "Positionering", description: "Verkoopargumenten, doelgroep en wat juist niet genoemd mag worden." },
  { id: "publicatie", title: "Publicatie", description: "Links, contactpersoon en publicatievoorkeuren." },
  { id: "documenten", title: "Documenten", description: "Bronbestanden voor extractie en controle." },
];

export const PROPERTY_TYPES = [
  "Appartement",
  "Benedenwoning",
  "Bovenwoning",
  "Maisonnette",
  "Penthouse",
  "Studio",
  "Tussenwoning",
  "Hoekwoning",
  "Eindwoning",
  "Twee-onder-een-kapwoning",
  "Vrijstaande woning",
  "Herenhuis",
  "Villa",
  "Bungalow",
  "Woonboerderij",
  "Woonboot",
  "Overig",
] as const;

export const ENERGY_LABELS = ["A+++++", "A++++", "A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G", "Onbekend", "Niet verplicht"] as const;

export const LISTING_STATUSES = [
  "in_voorbereiding",
  "beschikbaar",
  "onder_bod",
  "verkocht_onder_voorbehoud",
  "verkocht",
  "ingetrokken",
] as const;

export const SALE_CONDITIONS = ["kosten_koper", "vrij_op_naam"] as const;

const ORIENTATIONS = ["Noord", "Noordoost", "Oost", "Zuidoost", "Zuid", "Zuidwest", "West", "Noordwest", "Meerdere zijden"] as const;

const RAW_FIELDS: FieldDef[] = [
  // ---------------- Sectie 1: Basisgegevens ----------------
  { key: "address", column: "address", section: "basis", label: "Straatnaam", kind: "text", requiredForGeneration: true, extractable: true, maxLength: 200, placeholder: "Bijv. Laan van Meerdervoort" },
  { key: "house_number", column: "house_number", section: "basis", label: "Huisnummer", kind: "text", requiredForGeneration: true, extractable: true, maxLength: 20 },
  { key: "addition", column: "addition", section: "basis", label: "Toevoeging", kind: "text", extractable: true, maxLength: 20, placeholder: "Bijv. A of 2e verd." },
  { key: "postcode", column: "postcode", section: "basis", label: "Postcode", kind: "postcode", extractable: true, placeholder: "2517 AB" },
  { key: "city", column: "city", section: "basis", label: "Plaats", kind: "text", requiredForGeneration: true, extractable: true, maxLength: 120, placeholder: "Den Haag" },
  { key: "neighbourhood", column: "neighbourhood", section: "basis", label: "Wijk", kind: "text", extractable: true, maxLength: 160, placeholder: "Bijv. Statenkwartier" },
  { key: "property_type", column: "property_type", section: "basis", label: "Woningtype", kind: "select", options: PROPERTY_TYPES, requiredForGeneration: true, extractable: true },
  { key: "listing_status", column: "listing_status", section: "basis", label: "Verkoopstatus", kind: "select", options: LISTING_STATUSES },
  { key: "asking_price", column: "asking_price", section: "basis", label: "Vraagprijs", kind: "currency", extractable: true, min: 0, max: 1_000_000_000, unit: "€" },
  { key: "sale_condition", column: "sale_condition", section: "basis", label: "Kosten koper / vrij op naam", kind: "select", options: SALE_CONDITIONS, extractable: true },
  { key: "living_area", column: "living_area", section: "basis", label: "Woonoppervlakte", kind: "integer", extractable: true, min: 1, max: 100_000, unit: "m²", help: "Gebruiksoppervlakte wonen volgens NEN 2580 / meetinstructie." },
  { key: "plot_area", column: "plot_area", section: "basis", label: "Perceeloppervlakte", kind: "integer", extractable: true, min: 0, max: 10_000_000, unit: "m²" },
  { key: "year_built", column: "year_built", section: "basis", label: "Bouwjaar", kind: "integer", extractable: true, min: 1000, max: 2100 },
  { key: "energy_label", column: "energy_label", section: "basis", label: "Energielabel", kind: "select", options: ENERGY_LABELS, extractable: true },
  { key: "rooms", column: "rooms", section: "basis", label: "Aantal kamers", kind: "integer", extractable: true, min: 0, max: 200 },
  { key: "bedrooms", column: "bedrooms", section: "basis", label: "Aantal slaapkamers", kind: "integer", extractable: true, min: 0, max: 200 },
  { key: "bathrooms", column: "bathrooms", section: "basis", label: "Aantal badkamers", kind: "integer", extractable: true, min: 0, max: 100 },
  { key: "toilets", column: "toilets", section: "basis", label: "Aantal toiletten", kind: "integer", extractable: true, min: 0, max: 100 },
  { key: "floors", column: "floors", section: "basis", label: "Aantal woonlagen", kind: "integer", extractable: true, min: 0, max: 100 },
  { key: "floor_position", column: "floor_position", section: "basis", label: "Verdiepingspositie", kind: "text", extractable: true, maxLength: 120, help: "Voor appartementen, bijv. '2e verdieping van 4'." },

  // ---------------- Sectie 2: Woningkenmerken ----------------
  { key: "kenmerken.woonkamer", section: "kenmerken", label: "Woonkamer", kind: "textarea", extractable: true, help: "Afmetingen, lichtinval, vloer, haard, plafondhoogte." },
  { key: "kenmerken.keuken", section: "kenmerken", label: "Keuken", kind: "textarea", extractable: true, help: "Opstelling, materialen, bouwjaar keuken." },
  { key: "kenmerken.keukenapparatuur", section: "kenmerken", label: "Keukenapparatuur", kind: "textarea", extractable: true },
  { key: "kenmerken.slaapkamers", section: "kenmerken", label: "Slaapkamers", kind: "textarea", extractable: true },
  { key: "kenmerken.badkamers", section: "kenmerken", label: "Badkamers", kind: "textarea", extractable: true },
  { key: "kenmerken.buitenruimte", section: "kenmerken", label: "Buitenruimte", kind: "textarea", extractable: true, help: "Tuin, balkon, dakterras; afmetingen." },
  { key: "kenmerken.ligging_buitenruimte", section: "kenmerken", label: "Ligging buitenruimte", kind: "select", options: ORIENTATIONS, extractable: true },
  { key: "kenmerken.uitzicht", section: "kenmerken", label: "Uitzicht", kind: "textarea", extractable: true },
  { key: "kenmerken.bergruimte", section: "kenmerken", label: "Bergruimte", kind: "textarea", extractable: true },
  { key: "kenmerken.parkeren", section: "kenmerken", label: "Parkeergelegenheid", kind: "textarea", extractable: true },
  { key: "kenmerken.lift", section: "kenmerken", label: "Lift", kind: "select", options: ["Ja", "Nee", "Niet van toepassing"], extractable: true },
  { key: "kenmerken.toegankelijkheid", section: "kenmerken", label: "Toegankelijkheid", kind: "textarea", extractable: true },
  { key: "kenmerken.authentieke_details", section: "kenmerken", label: "Authentieke details", kind: "textarea", extractable: true, help: "Ornamentplafonds, glas-in-lood, en-suite-kasten, paneeldeuren." },
  { key: "kenmerken.renovaties", section: "kenmerken", label: "Renovaties", kind: "textarea", extractable: true, help: "Wat is wanneer gerenoveerd?" },
  { key: "kenmerken.onderhoud", section: "kenmerken", label: "Onderhoud", kind: "textarea", extractable: true },
  { key: "kenmerken.beglazing", section: "kenmerken", label: "Beglazing", kind: "text", extractable: true },
  { key: "kenmerken.isolatie", section: "kenmerken", label: "Isolatie", kind: "textarea", extractable: true },
  { key: "kenmerken.verwarming", section: "kenmerken", label: "Verwarming", kind: "textarea", extractable: true, help: "Type installatie en bouwjaar ketel/warmtepomp." },
  { key: "kenmerken.zonnepanelen", section: "kenmerken", label: "Zonnepanelen", kind: "text", extractable: true },
  { key: "kenmerken.indeling", section: "kenmerken", label: "Indeling per verdieping", kind: "textarea", extractable: true, help: "Beschrijf per verdieping de ruimtes, in looprichting.", maxLength: 6000 },

  // ---------------- Sectie 3: Locatie ----------------
  { key: "locatie.karakter_wijk", section: "locatie", label: "Karakter van de wijk", kind: "textarea", extractable: true },
  { key: "locatie.winkels", section: "locatie", label: "Winkels", kind: "textarea", extractable: true },
  { key: "locatie.horeca", section: "locatie", label: "Restaurants en horeca", kind: "textarea", extractable: true },
  { key: "locatie.scholen", section: "locatie", label: "Scholen", kind: "textarea", extractable: true },
  { key: "locatie.kinderopvang", section: "locatie", label: "Kinderopvang", kind: "textarea", extractable: true },
  { key: "locatie.speelplekken", section: "locatie", label: "Speelplekken", kind: "textarea", extractable: true },
  { key: "locatie.parken", section: "locatie", label: "Parken", kind: "textarea", extractable: true },
  { key: "locatie.strand_duinen", section: "locatie", label: "Strand en duinen", kind: "textarea", extractable: true },
  { key: "locatie.sport", section: "locatie", label: "Sport", kind: "textarea", extractable: true },
  { key: "locatie.openbaar_vervoer", section: "locatie", label: "Openbaar vervoer", kind: "textarea", extractable: true },
  { key: "locatie.bereikbaarheid", section: "locatie", label: "Bereikbaarheid", kind: "textarea", extractable: true },
  { key: "locatie.overig", section: "locatie", label: "Overige bijzonderheden", kind: "textarea", extractable: true },
  { key: "locatie.reistijden", section: "locatie", label: "Bevestigde reistijden", kind: "textarea", help: "Alleen reistijden die u zelf heeft gecontroleerd. Andere reistijden worden niet in teksten genoemd." },

  // ---------------- Sectie 4: Juridisch en technisch ----------------
  { key: "juridisch.eigendom", section: "juridisch", label: "Eigen grond of erfpacht", kind: "select", options: ["Eigen grond", "Erfpacht", "Gedeeltelijk erfpacht", "Onbekend"], extractable: true },
  { key: "juridisch.erfpacht_canon", section: "juridisch", label: "Erfpachtcanon", kind: "text", extractable: true, help: "Bedrag en periode, bijv. € 1.250 per jaar." },
  { key: "juridisch.erfpacht_voorwaarden", section: "juridisch", label: "Erfpachtvoorwaarden", kind: "textarea", extractable: true, help: "Afgekocht tot, algemene bepalingen, herziening." },
  { key: "juridisch.vve_status", section: "juridisch", label: "VvE-status", kind: "select", options: ["Niet van toepassing", "Actief", "Slapend", "Onbekend"], extractable: true },
  { key: "juridisch.vve_bijdrage", section: "juridisch", label: "VvE-bijdrage", kind: "text", extractable: true, help: "Bijv. € 185 per maand." },
  { key: "juridisch.vve_bijzonderheden", section: "juridisch", label: "VvE-bijzonderheden", kind: "textarea", extractable: true, help: "MJOP, reservefonds, opstalverzekering." },
  { key: "juridisch.monument", section: "juridisch", label: "Monumentstatus", kind: "select", options: ["Geen monument", "Rijksmonument", "Gemeentelijk monument", "Karakteristiek pand", "Onbekend"], extractable: true },
  { key: "juridisch.beschermd_stadsgezicht", section: "juridisch", label: "Beschermd stadsgezicht", kind: "select", options: ["Ja", "Nee", "Onbekend"], extractable: true },
  { key: "juridisch.kadastraal", section: "juridisch", label: "Kadastrale gegevens", kind: "textarea", extractable: true, help: "Gemeente, sectie, perceelnummer, appartementsindex, grootte." },
  { key: "juridisch.technische_installatie", section: "juridisch", label: "Technische installatie", kind: "textarea", extractable: true },
  { key: "juridisch.bekende_gebreken", section: "juridisch", label: "Bekende gebreken", kind: "textarea", extractable: true, help: "Wordt niet in marketingteksten genoemd, wel gebruikt om onjuiste claims te voorkomen." },
  { key: "juridisch.verkoopclausules", section: "juridisch", label: "Verkoopclausules", kind: "textarea", extractable: true, help: "Bijv. ouderdomsclausule, asbestclausule, niet-zelfbewoningsclausule. Alleen opnemen wat van toepassing is." },
  { key: "juridisch.verkoopvoorwaarden", section: "juridisch", label: "Verkoopvoorwaarden", kind: "textarea", extractable: true },
  { key: "juridisch.oplevering", section: "juridisch", label: "Oplevering", kind: "text", extractable: true, help: "Bijv. 'In overleg' of 'Per 1 maart 2027'." },

  // ---------------- Sectie 5: Positionering ----------------
  { key: "positionering.usp_1", section: "positionering", label: "Belangrijkste verkoopargument", kind: "text", maxLength: 300 },
  { key: "positionering.usp_2", section: "positionering", label: "Tweede verkoopargument", kind: "text", maxLength: 300 },
  { key: "positionering.usp_3", section: "positionering", label: "Derde verkoopargument", kind: "text", maxLength: 300 },
  { key: "positionering.onderscheidend", section: "positionering", label: "Wat maakt deze woning onderscheidend?", kind: "textarea" },
  { key: "positionering.doelgroep", section: "positionering", label: "Gewenste doelgroep", kind: "text", maxLength: 300, placeholder: "Bijv. jonge gezinnen die ruimte zoeken binnen de stad" },
  { key: "positionering.uitstraling", section: "positionering", label: "Gewenste uitstraling", kind: "text", maxLength: 300, placeholder: "Bijv. rustig, ingetogen, zakelijk" },
  { key: "positionering.verhaal", section: "positionering", label: "Verhaal of achtergrond van de woning", kind: "textarea", help: "Alleen feitelijke achtergrond; geen verzonnen verhalen." },
  { key: "positionering.instructies", section: "positionering", label: "Bijzondere instructies", kind: "textarea" },
  { key: "positionering.niet_noemen", section: "positionering", label: "Zaken die niet genoemd mogen worden", kind: "textarea", help: "Eén onderwerp per regel. De eindcontrole controleert hier expliciet op." },

  // ---------------- Sectie 6: Publicatie ----------------
  { key: "publicatie.funda_url", section: "publicatie", label: "Funda-link", kind: "url" },
  { key: "publicatie.website_url", section: "publicatie", label: "Website-link", kind: "url" },
  { key: "publicatie.bezichtiging_url", section: "publicatie", label: "Bezichtigingslink", kind: "url" },
  { key: "publicatie.omgevingsfilm_url", section: "publicatie", label: "Omgevingsfilm", kind: "url" },
  { key: "publicatie.contactpersoon", section: "publicatie", label: "Contactpersoon", kind: "text", maxLength: 120 },
  { key: "publicatie.telefoon", section: "publicatie", label: "Telefoonnummer", kind: "tel", maxLength: 30 },
  { key: "publicatie.email", section: "publicatie", label: "E-mailadres", kind: "email", maxLength: 320 },
  { key: "publicatie.prijs_op_social", section: "publicatie", label: "Prijs vermelden op social media", kind: "boolean" },
  { key: "publicatie.publicatiedatum", section: "publicatie", label: "Publicatiedatum", kind: "date" },
  { key: "publicatie.extra_hashtags", section: "publicatie", label: "Aanvullende hashtags", kind: "tags", help: "Gescheiden door spaties of komma's, zonder of met #." },
];

/** Alle velden, elk met een uitleg (tooltip) uit field-tips.ts. */
export const FIELDS: FieldDef[] = RAW_FIELDS.map((f) => ({ ...f, tip: FIELD_TIPS[f.key] ?? f.help }));


export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export const EXTRACTABLE_FIELDS = FIELDS.filter((f) => f.extractable);

export function fieldsForSection(section: SectionId) {
  return FIELDS.filter((f) => f.section === section);
}

// ---------------------------------------------------------------------------
// Validatie
// ---------------------------------------------------------------------------
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

function zodForField(f: FieldDef): z.ZodType {
  const max = f.maxLength ?? (f.kind === "textarea" ? 4000 : 500);
  switch (f.kind) {
    case "integer":
    case "currency":
      return z.preprocess(
        (v) => {
          const e = emptyToNull(v);
          if (typeof e === "string") {
            const cleaned = e.replace(/[€\s.]/g, "").replace(",", ".");
            return cleaned === "" ? null : Number(cleaned);
          }
          return e;
        },
        z
          .number({ error: `${f.label}: vul een getal in` })
          .int(`${f.label}: vul een geheel getal in`)
          .min(f.min ?? 0, `${f.label}: minimaal ${f.min ?? 0}`)
          .max(f.max ?? 1_000_000_000, `${f.label}: maximaal ${f.max ?? 1_000_000_000}`)
          .nullable(),
      );
    case "select":
      return z.preprocess(emptyToNull, z.enum(f.options as [string, ...string[]], { error: `${f.label}: kies een geldige optie` }).nullable());
    case "boolean":
      return z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v === "" ? null : v), z.boolean().nullable());
    case "url":
      return z.preprocess(
        emptyToNull,
        z
          .url({ protocol: /^https?$/, error: `${f.label}: vul een geldige link in (https://…)` })
          .max(500)
          .nullable(),
      );
    case "email":
      return z.preprocess(emptyToNull, z.email(`${f.label}: ongeldig e-mailadres`).max(320).nullable());
    case "tel":
      return z.preprocess(emptyToNull, z.string().regex(/^[+0-9 ()-]{6,30}$/, `${f.label}: ongeldig telefoonnummer`).nullable());
    case "date":
      return z.preprocess(emptyToNull, z.iso.date(`${f.label}: ongeldige datum`).nullable());
    case "postcode":
      return z.preprocess(
        (v) => {
          const e = emptyToNull(v);
          if (typeof e !== "string") return e;
          const m = e.trim().toUpperCase().match(/^([1-9][0-9]{3})\s?([A-Z]{2})$/);
          return m ? `${m[1]} ${m[2]}` : e;
        },
        z.string().regex(/^[1-9][0-9]{3} [A-Z]{2}$/, `${f.label}: gebruik het formaat 1234 AB`).nullable(),
      );
    case "tags":
      return z.preprocess(
        (v) => {
          if (Array.isArray(v)) return v;
          const e = emptyToNull(v);
          if (typeof e !== "string") return e ?? [];
          return e.split(/[\s,]+/).map((t) => t.replace(/^#+/, "").trim()).filter(Boolean);
        },
        z.array(z.string().regex(/^[\p{L}\p{N}_]{1,60}$/u, `${f.label}: alleen letters en cijfers per hashtag`)).max(15),
      );
    default:
      return z.preprocess(
        (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.replace(/\r\n/g, "\n")) : v),
        z.string().max(max, `${f.label}: maximaal ${max} tekens`).nullable(),
      );
  }
}

const shape: Record<string, z.ZodType> = {};
for (const f of FIELDS) shape[f.key] = zodForField(f).optional();

/**
 * Validatieschema voor (gedeeltelijke) woningupdates vanuit het formulier.
 * Onbekende sleutels (zoals organization_id, created_by) worden geweigerd:
 * bescherming tegen mass assignment naast de databasetriggers.
 */
export const propertyPatchSchema = z.strictObject(shape);
export type PropertyPatch = Record<string, unknown>;

export function fieldValueSchema(key: string) {
  const f = FIELD_BY_KEY.get(key);
  if (!f) throw new Error(`Onbekend veld: ${key}`);
  return zodForField(f);
}
