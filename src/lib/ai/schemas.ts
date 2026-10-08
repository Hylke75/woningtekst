import { z } from "zod";

/**
 * Structured-output schema's voor alle Claude-aanroepen. Elk antwoord wordt
 * na ontvangst nogmaals met deze schema's gevalideerd; tekst wordt nooit
 * "los" geparsed.
 */

const para = z.string().min(1).max(4000);

// ---------------------------------------------------------------------------
// Extractie
// ---------------------------------------------------------------------------
export const extractionSchema = z.object({
  feiten: z
    .array(
      z.object({
        veld: z.string().describe("Exacte veldnaam uit de lijst toegestane velden"),
        waarde: z.string().describe("Waarde zoals in de bron, genormaliseerd naar het verwachte formaat"),
        citaat: z.string().describe("Letterlijk, kort citaat uit de bron waaruit de waarde blijkt"),
        locatie: z.string().describe("Pagina, kop of alinea in de bron; leeg indien onbekend"),
        betrouwbaarheid: z.enum(["hoog", "middel", "laag"]),
      }),
    )
    .max(200),
  opmerkingen: z.array(z.string()).max(20).describe("Onduidelijkheden of tegenstrijdigheden binnen deze bron"),
});
export type ExtractionOutput = z.infer<typeof extractionSchema>;

// ---------------------------------------------------------------------------
// Pipeline stap 4: verkoopargumenten en analyse
// ---------------------------------------------------------------------------
export const analysisSchema = z.object({
  kernboodschap: z.string().max(600),
  verkoopargumenten: z
    .array(z.object({ argument: z.string().max(300), onderbouwing: z.string().max(600), bronvelden: z.array(z.string()).max(8) }))
    .min(1)
    .max(6),
  doelgroep: z.string().max(400),
  toon: z.string().max(300),
  niet_noemen: z.array(z.string()).max(30),
  ontbrekende_gegevens: z
    .array(z.object({ veld: z.string(), toelichting: z.string().max(400), ernst: z.enum(["info", "waarschuwing", "kritiek"]) }))
    .max(30),
});
export type AnalysisOutput = z.infer<typeof analysisSchema>;

// ---------------------------------------------------------------------------
// Pipeline stap 5/6: teksten per taal
// ---------------------------------------------------------------------------
export const fundaSchema = z.object({
  introductie: z.array(para).min(1).max(6),
  locatie: z.array(para).min(1).max(5),
  kenmerken: z.array(z.string().max(400)).min(3).max(20).describe("Opsomming 'Wat je graag wilt weten over …'"),
  indeling: z
    .array(z.object({ verdieping: z.string().max(80), tekst: para }))
    .min(1)
    .max(10),
  kadastraal: z.array(para).max(3).describe("Alleen bevestigde kadastrale en eigendomsgegevens; leeg als onbekend"),
  oplevering: z.array(para).max(2),
});

export const websiteSchema = z.object({
  titel: z.string().max(120),
  alineas: z.array(para).min(2).max(8),
});

export const socialSchema = z.object({ tekst: z.string().min(1).max(2000) });

export const languageTextsSchema = z.object({
  funda: fundaSchema,
  website: websiteSchema,
  facebook: socialSchema,
  instagram: socialSchema,
});
export type LanguageTexts = z.infer<typeof languageTextsSchema>;
export type FundaText = z.infer<typeof fundaSchema>;

// ---------------------------------------------------------------------------
// Pipeline stap 8: SEO en hashtags
// ---------------------------------------------------------------------------
const seoItem = z.object({
  seo_title: z.string().max(70),
  meta_description: z.string().max(160),
  slug: z.string().max(100),
});
const tags = z.array(z.string().max(60)).max(10);

export const seoSchema = z.object({
  nl: seoItem,
  en: seoItem,
  hashtags: z.object({
    funda_nl: tags,
    funda_en: tags,
    website_nl: tags,
    website_en: tags,
    facebook_nl: tags,
    facebook_en: tags,
    instagram_nl: tags,
    instagram_en: tags,
  }),
});
export type SeoOutput = z.infer<typeof seoSchema>;

// ---------------------------------------------------------------------------
// Pipeline stap 7 + 9: inhoudelijke overeenstemming en eindcontrole
// ---------------------------------------------------------------------------
export const reviewSchema = z.object({
  samenvatting: z.string().max(800),
  bevindingen: z
    .array(
      z.object({
        ernst: z.enum(["info", "waarschuwing", "kritiek"]),
        kanaal: z.enum(["funda", "website", "facebook", "instagram", "algemeen"]),
        taal: z.enum(["nl", "en", "beide"]),
        categorie: z.enum(["feitelijk", "consistentie_nl_en", "stijl", "privacy", "juridisch", "ontbrekend", "overig"]),
        omschrijving: z.string().max(800),
        bron: z.string().max(400).describe("Betreffend veld of tekstfragment"),
      }),
    )
    .max(40),
});
export type ReviewOutput = z.infer<typeof reviewSchema>;

// ---------------------------------------------------------------------------
// Enkele tekst: hergeneratie en herschrijving
// ---------------------------------------------------------------------------
export const singleFundaSchema = z.object({ funda: fundaSchema });
export const singleWebsiteSchema = z.object({ website: websiteSchema });
export const singleSocialSchema = z.object({ tekst: z.string().min(1).max(2000) });

/** Herschrijving werkt op de bestaande opmaak (HTML-subset) om structuur te behouden. */
export const rewriteSchema = z.object({
  html: z.string().min(1).max(60000).describe("Herschreven tekst als HTML met alleen <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>"),
  toelichting: z.string().max(400),
});

// ---------------------------------------------------------------------------
// 'Controleer deze tekst': voorstellen zonder automatische wijziging
// ---------------------------------------------------------------------------
export const textReviewSchema = z.object({
  oordeel: z.string().max(600),
  voorstellen: z
    .array(
      z.object({
        origineel: z.string().min(1).max(1000).describe("Exact, letterlijk fragment uit de tekst"),
        voorstel: z.string().max(1000),
        reden: z.string().max(400),
        categorie: z.enum(["feitelijk", "taal", "stijl", "cliche", "consistentie", "privacy", "overig"]),
      }),
    )
    .max(25),
});
export type TextReviewOutput = z.infer<typeof textReviewSchema>;

// ---------------------------------------------------------------------------
// Schrijfwijzer-analyse (admin): voorstel voor nieuwe versie
// ---------------------------------------------------------------------------
export const styleGuideAnalysisSchema = z.object({
  analyse: z.string().max(4000),
  voorstel_markdown: z.string().min(200).max(60000),
});
