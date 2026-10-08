import { AppError } from "@/lib/errors";
import type { AiRequest, AiResponse } from "@/lib/ai/transport";

/**
 * Deterministische AI-mock voor geautomatiseerde tests (AI_MOCK=true).
 * Levert schema-conforme antwoorden op basis van de invoer, zonder externe
 * aanroepen of kosten. Wordt in productie geweigerd (zie env.ts).
 *
 * Testhaken (alleen in mockmodus): een woningprofiel of tekst met
 * [[MOCK_TIMEOUT]], [[MOCK_FOUT]] of [[MOCK_ONGELDIG]] simuleert respectievelijk
 * een timeout, een API-fout en een ongeldig antwoord; [[MOCK_TIMEOUT_EENMALIG]]
 * simuleert een tijdelijke timeout die bij een volgende poging verdwijnt.
 */

export type MockProfile = {
  street: string;
  city: string;
  type: string;
  livingArea?: number | null;
  yearBuilt?: number | null;
  energyLabel?: string | null;
  bedrooms?: number | null;
  neighbourhood?: string | null;
};

function words(n: number, seed: string): string {
  const base = `${seed} biedt ruimte licht en rust in een buurt met karakter waar je dagelijks gemak ervaart`.split(" ");
  return Array.from({ length: n }, (_, i) => base[i % base.length]).join(" ");
}

function textOf(req: AiRequest): string {
  return req.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
}

function response(req: AiRequest, payload: unknown): AiResponse {
  const text = JSON.stringify(payload);
  return {
    text,
    model: req.model,
    stopReason: "end_turn",
    usage: { input_tokens: Math.ceil(textOf(req).length / 4) + 500, output_tokens: Math.ceil(text.length / 4), cache_read_input_tokens: 0 },
  };
}

const EXTRACT_PATTERNS: { veld: string; re: RegExp; map?: (m: RegExpMatchArray) => string }[] = [
  { veld: "address", re: /(?:straat|adres)\s*:\s*([A-Za-zÀ-ÿ .'-]+?)\s+(\d+)/i, map: (m) => m[1].trim() },
  { veld: "house_number", re: /(?:straat|adres)\s*:\s*[A-Za-zÀ-ÿ .'-]+?\s+(\d+)/i },
  { veld: "postcode", re: /\b([1-9]\d{3}\s?[A-Z]{2})\b/ },
  { veld: "city", re: /plaats\s*:\s*([A-Za-zÀ-ÿ' -]+)/i },
  { veld: "neighbourhood", re: /wijk\s*:\s*([A-Za-zÀ-ÿ' -]+)/i },
  { veld: "property_type", re: /woningtype\s*:\s*([A-Za-zÀ-ÿ-]+)/i },
  { veld: "year_built", re: /bouwjaar\s*:?\s*(\d{4})/gi },
  { veld: "living_area", re: /woonoppervlakte\s*:?\s*(\d+)/i },
  { veld: "plot_area", re: /perceel(?:oppervlakte)?\s*:?\s*(\d+)/i },
  { veld: "asking_price", re: /vraagprijs\s*:?\s*€?\s*([\d.]+)/i, map: (m) => m[1].replace(/\./g, "") },
  { veld: "energy_label", re: /energielabel\s*:?\s*([A-G]\+*)/i },
  { veld: "bedrooms", re: /(\d+)\s+slaapkamers/i },
  { veld: "rooms", re: /(\d+)\s+kamers/i },
  { veld: "kenmerken.keuken", re: /keuken\s*:\s*([^\n]+)/i },
  { veld: "juridisch.eigendom", re: /\b(eigen grond|erfpacht)\b/i, map: (m) => (m[1].toLowerCase() === "erfpacht" ? "Erfpacht" : "Eigen grond") },
];

function mockExtraction(req: AiRequest) {
  const text = textOf(req);
  const docMatch = text.match(/<document[^>]*>([\s\S]*?)<\/document>/);
  const source = docMatch ? docMatch[1] : text;
  const feiten: { veld: string; waarde: string; citaat: string; locatie: string; betrouwbaarheid: "hoog" | "middel" | "laag" }[] = [];
  for (const p of EXTRACT_PATTERNS) {
    if (p.re.global) {
      for (const m of source.matchAll(p.re)) {
        feiten.push({ veld: p.veld, waarde: p.map ? p.map(m) : m[1].trim(), citaat: m[0].slice(0, 200), locatie: "", betrouwbaarheid: "hoog" });
      }
    } else {
      const m = source.match(p.re);
      if (m) feiten.push({ veld: p.veld, waarde: p.map ? p.map(m) : m[1].trim(), citaat: m[0].slice(0, 200), locatie: "", betrouwbaarheid: "hoog" });
    }
  }
  const opmerkingen = /negeer|ignore previous|systeemprompt|system prompt/i.test(source)
    ? ["De bron bevat instructies gericht aan de AI; deze zijn genegeerd."]
    : [];
  return { feiten, opmerkingen };
}

function profileFrom(req: AiRequest): MockProfile {
  const p = (req.mockInput ?? {}) as Partial<MockProfile>;
  return { street: p.street ?? "de woning", city: p.city ?? "Den Haag", type: p.type ?? "woning", ...p } as MockProfile;
}

function languageTexts(p: MockProfile, lang: "nl" | "en") {
  const nl = lang === "nl";
  const area = p.livingArea ? (nl ? `${p.livingArea} m² woonoppervlakte` : `${p.livingArea} m² of living space`) : nl ? "royale woonoppervlakte" : "generous living space";
  const year = p.yearBuilt ? (nl ? `bouwjaar ${p.yearBuilt}` : `built in ${p.yearBuilt}`) : "";
  const intro = nl
    ? `Aan de ${p.street} in ${p.city} woon je in een ${p.type.toLowerCase()} met ${area}. ${words(60, "Deze woning")}`
    : `On ${p.street} in ${p.city} you live in a ${p.type.toLowerCase()} with ${area}. ${words(60, "This home")}`;
  return {
    funda: {
      introductie: [intro, words(90, nl ? "Je woonkamer" : "Your living room")],
      locatie: [words(90, nl ? "De buurt" : "The neighbourhood")],
      kenmerken: [area, year || (nl ? "Bouwjaar onbekend" : "Year of construction unknown"), p.energyLabel ? `Energielabel ${p.energyLabel}` : nl ? "Energielabel onbekend" : "Energy label unknown"],
      indeling: [
        { verdieping: nl ? "Begane grond" : "Ground floor", tekst: words(120, nl ? "Via de hal" : "Through the hall") },
        { verdieping: nl ? "Eerste verdieping" : "First floor", tekst: words(110, nl ? "Op de verdieping" : "Upstairs") },
      ],
      kadastraal: [],
      oplevering: [nl ? "Oplevering in overleg." : "Delivery by arrangement."],
    },
    website: {
      titel: nl ? `${p.type} aan de ${p.street}, ${p.city}` : `${p.type} on ${p.street}, ${p.city}`,
      alineas: [intro, words(130, nl ? "Wonen hier" : "Living here"), words(120, nl ? "Vanuit huis" : "From home")],
    },
    facebook: { tekst: `${intro.split(".")[0]}. ${words(80, nl ? "Plan je bezichtiging" : "Book your viewing")}.` },
    instagram: { tekst: `${p.street}, ${p.city}. ${words(60, nl ? "Licht en ruimte" : "Light and space")}.` },
  };
}

const firedOnce = new Set<string>();

export async function mockComplete(req: AiRequest): Promise<AiResponse> {
  const all = textOf(req) + JSON.stringify(req.mockInput ?? {});
  if (all.includes("[[MOCK_TIMEOUT_EENMALIG]]")) {
    const key = String((req.mockInput as { street?: string } | undefined)?.street ?? all.slice(0, 200));
    if (!firedOnce.has(key)) {
      firedOnce.add(key);
      throw new AppError("ai_timeout", "Claude reageerde niet op tijd. Probeer het opnieuw.", 504, true);
    }
  }
  if (all.includes("[[MOCK_TIMEOUT]]")) throw new AppError("ai_timeout", "Claude reageerde niet op tijd. Probeer het opnieuw.", 504, true);
  if (all.includes("[[MOCK_FOUT]]")) throw new AppError("ai_fout", "Claude is tijdelijk niet bereikbaar. Probeer het opnieuw.", 503, true);
  if (all.includes("[[MOCK_ONGELDIG]]")) return { ...response(req, {}), text: "{ongeldig" };

  const p = profileFrom(req);
  switch (req.operation) {
    case "extractie":
      return response(req, mockExtraction(req));
    case "analyse":
      return response(req, {
        kernboodschap: `Een ${p.type.toLowerCase()} in ${p.city} voor wie ruimte en rust zoekt.`,
        verkoopargumenten: [{ argument: "Ligging", onderbouwing: `Aan de ${p.street}`, bronvelden: ["address"] }],
        doelgroep: "Gezinnen en stellen",
        toon: "Rustig en feitelijk",
        niet_noemen: [],
        ontbrekende_gegevens: [],
      });
    case "nederlands":
      return response(req, languageTexts(p, "nl"));
    case "engels":
      return response(req, languageTexts(p, "en"));
    case "seo": {
      const slugBase = `${p.type}-${p.street}-${p.city}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const set = (extra: string[]) => ["#KorffdeGidts", `#${p.city.replace(/\s/g, "")}`, ...extra];
      return response(req, {
        nl: { seo_title: `${p.type} ${p.street}, ${p.city}`.slice(0, 60), meta_description: `Te koop: ${p.type.toLowerCase()} aan de ${p.street} in ${p.city}. Bekijk de indeling, kenmerken en plan een bezichtiging.`.slice(0, 155), slug: slugBase },
        en: { seo_title: `${p.type} ${p.street}, ${p.city}`.slice(0, 60), meta_description: `For sale: ${p.type.toLowerCase()} on ${p.street} in ${p.city}. View the layout and features and book a viewing.`.slice(0, 155), slug: `${slugBase}-en` },
        hashtags: {
          funda_nl: set(["#tekoop"]),
          funda_en: set(["#forsale"]),
          website_nl: set(["#tekoop"]),
          website_en: set(["#forsale"]),
          facebook_nl: set(["#tekoop", "#woning", "#makelaar"]),
          facebook_en: set(["#forsale", "#home", "#realestate"]),
          instagram_nl: set(["#tekoop", "#woning", "#interieur", "#wonen"]),
          instagram_en: set(["#forsale", "#home", "#interior", "#realestate"]),
        },
      });
    }
    case "review":
      return response(req, { samenvatting: "Geen inhoudelijke afwijkingen gevonden (testmodus).", bevindingen: [] });
    case "hergeneratie": {
      const job = (req.mockInput ?? {}) as { channel?: string; language?: "nl" | "en" };
      const texts = languageTexts(p, job.language ?? "nl");
      if (job.channel === "funda") return response(req, { funda: texts.funda });
      if (job.channel === "website") return response(req, { website: texts.website });
      return response(req, { tekst: job.channel === "facebook" ? texts.facebook.tekst : texts.instagram.tekst });
    }
    case "herschrijving": {
      const m = textOf(req).match(/<tekst>([\s\S]*?)<\/tekst>/);
      const html = (m?.[1] ?? "<p>Tekst</p>").trim();
      return response(req, { html: html.replace(/<p>/, "<p>[herschreven] "), toelichting: "Herschreven in testmodus." });
    }
    case "tekstcontrole": {
      const m = textOf(req).match(/<tekst>([\s\S]*?)<\/tekst>/);
      const plain = (m?.[1] ?? "").replace(/<[^>]+>/g, " ");
      const cliche = plain.match(/een unieke kans|een oase van rust|een ware parel/i);
      return response(req, {
        oordeel: cliche ? "Eén cliché gevonden." : "Geen verbeterpunten gevonden (testmodus).",
        voorstellen: cliche ? [{ origineel: cliche[0], voorstel: "een woning met een zeldzame combinatie van ruimte en ligging", reden: "Cliché volgens de schrijfwijzer", categorie: "cliche" }] : [],
      });
    }
    case "schrijfwijzer_analyse":
      return response(req, {
        analyse: "Analyse in testmodus.",
        voorstel_markdown: `# Schrijfwijzer (voorstel)\n\n${words(60, "Schrijf helder")}\n\n## 6. Te vermijden\n\n- een unieke kans\n- een oase van rust\n`,
      });
    default:
      throw new AppError("ai_fout", `Onbekende mock-operatie: ${req.operation}`);
  }
}
