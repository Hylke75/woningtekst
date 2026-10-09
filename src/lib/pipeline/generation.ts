import "server-only";
import { callClaude } from "@/lib/ai/call";
import {
  GENERATION_TASKS,
  PROMPT_VERSION,
  examplesForPrompt,
  generationContext,
  generationSystem,
  profileForPrompt,
  type ExampleText,
  type GenerationTask,
} from "@/lib/ai/prompts";
import type { AiContentBlock } from "@/lib/ai/transport";
import { serverEnv } from "@/lib/env";
import { promptVersionWithStyle, STANDARD_STYLE, styleBlock, styleChoiceSchema, type WritingStyleRow } from "@/lib/content/writing-styles";
import { resolveWritingStyle } from "@/lib/data/writing-styles";
import {
  analysisSchema,
  languageTextsSchema,
  reviewSchema,
  seoSchema,
  type AnalysisOutput,
  type LanguageTexts,
  type ReviewOutput,
  type SeoOutput,
} from "@/lib/ai/schemas";
import type { MockProfile } from "@/lib/ai/mock";
import { fundaToHtml, htmlToPlainText, normalizeHashtags, plainToHtml, slugify, websiteToHtml } from "@/lib/content/html";
import { closingPassages, forbiddenPhrases, guideForPrompt, parsePassages } from "@/lib/content/style-guide";
import { checkText, compareLanguages, type Finding } from "@/lib/content/validators";
import { getFieldValue, missingForGeneration, streetLabel } from "@/lib/domain/property-mapping";
import { AppError, fromDbError } from "@/lib/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Channel, DocumentRow, JobRow, Language, PropertyRow, StyleGuideRow } from "@/lib/db-types";
import { SLOTS, getStyleGuide, isProtected, latestVersions, type SlotKey } from "@/lib/data/content";
import { claimJob, failJob, getJob, hashInput, updateJob } from "@/lib/pipeline/jobs";

export const GENERATION_STEPS = ["analyse", "nederlands", "engels", "seo", "controle", "opslaan"] as const;
export type GenerationStep = (typeof GENERATION_STEPS)[number];

export const STEP_LABELS: Record<GenerationStep, string> = {
  analyse: "Woningprofiel analyseren en verkoopargumenten bepalen",
  nederlands: "Nederlandse teksten schrijven",
  engels: "Engelse teksten redigeren",
  seo: "SEO-gegevens en hashtags maken",
  controle: "Inhoudelijke overeenstemming en eindcontrole",
  opslaan: "Teksten en controlepunten opslaan",
};

type Steps = {
  analyse?: AnalysisOutput;
  nederlands?: LanguageTexts;
  engels?: LanguageTexts;
  seo?: SeoOutput;
  controle?: { ai: ReviewOutput; checks: Finding[] };
  opslaan?: { saved: SlotKey[]; skipped: SlotKey[] };
};

export function mockProfile(p: PropertyRow): MockProfile {
  return {
    street: streetLabel(p),
    city: p.city ?? "Den Haag",
    type: p.property_type ?? "Woning",
    livingArea: p.living_area,
    yearBuilt: p.year_built,
    energyLabel: p.energy_label,
    bedrooms: p.bedrooms,
    neighbourhood: p.neighbourhood,
  };
}

/** Vingerafdruk van alle invoer van een volledige generatie. */
export function generationInputHash(property: PropertyRow, styleGuideId: string, overwriteSlots: string[], style: WritingStyleRow | null = null) {
  // Standaardstijl houdt de oorspronkelijke hash (bestaande jobs blijven hervatbaar).
  // Een gekozen stijl telt mee inclusief de instructie: tussentijds bewerken blokkeert hervatten.
  return hashInput(
    style
      ? { profile: profileForPrompt(property), guide: styleGuideId, overwrite: overwriteSlots, style: { id: style.id, instruction: style.instruction } }
      : { profile: profileForPrompt(property), guide: styleGuideId, overwrite: overwriteSlots },
  );
}

/** De bij de job gekozen schrijfstijl (null = standaard). */
export async function jobStyle(supabase: ServerSupabase, job: JobRow): Promise<WritingStyleRow | null> {
  const parsed = styleChoiceSchema.safeParse(job.params?.schrijfstijl ?? STANDARD_STYLE);
  return resolveWritingStyle(supabase, parsed.success ? parsed.data : STANDARD_STYLE);
}

/** Voorwaarden vóór een (betaalde) volledige generatie. */
export async function assertReadyForGeneration(supabase: ServerSupabase, property: PropertyRow) {
  if (property.deleted_at) throw new AppError("ongeldige_invoer", "Deze woning is gearchiveerd.");
  const missing = missingForGeneration(property);
  if (missing.length) {
    throw new AppError("ongeldige_invoer", `Vul eerst de verplichte gegevens in: ${missing.map((f) => f.label.toLowerCase()).join(", ")}.`);
  }
  const { count, error } = await supabase
    .from("property_facts")
    .select("id", { count: "exact", head: true })
    .eq("property_id", property.id)
    .eq("verification_status", "conflict");
  if (error) throw fromDbError(error);
  if (count && count > 0) {
    throw new AppError("ongeldige_invoer", `Er ${count === 1 ? "is 1 conflicterend gegeven" : `zijn ${count} conflicterende gegevens`} dat eerst handmatig moet worden beoordeeld (Bronnen en controle).`);
  }
  if (!property.data_checked_at) {
    throw new AppError("ongeldige_invoer", "Bevestig eerst dat u de woninggegevens heeft gecontroleerd.");
  }
}

function doNotMention(property: PropertyRow, analysis?: AnalysisOutput): string[] {
  const own = String(getFieldValue(property, "positionering.niet_noemen") ?? "")
    .split(/\n|;/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter((s) => s.length >= 3 && s.length <= 80);
  return [...new Set([...own, ...(analysis?.niet_noemen ?? []).filter((s) => s.length <= 80)])];
}

function allowedContacts(property: PropertyRow): string[] {
  return [getFieldValue(property, "publicatie.telefoon"), getFieldValue(property, "publicatie.email")].filter(Boolean).map(String);
}

function textsAsPlain(texts: LanguageTexts): string {
  const f = texts.funda;
  return [
    "FUNDA:",
    ...f.introductie,
    ...f.locatie,
    ...f.kenmerken.map((k) => `- ${k}`),
    ...f.indeling.map((v) => `${v.verdieping}: ${v.tekst}`),
    ...f.kadastraal,
    ...f.oplevering,
    "\nWEBSITE:",
    texts.website.titel,
    ...texts.website.alineas,
    "\nFACEBOOK:",
    texts.facebook.tekst,
    "\nINSTAGRAM:",
    texts.instagram.tekst,
  ].join("\n");
}

/** Zet de gestructureerde AI-output om naar HTML per kanaal/taal. */
export function buildSlotHtml(
  channel: Channel,
  language: Language,
  texts: LanguageTexts,
  property: PropertyRow,
  guide: StyleGuideRow,
): string {
  if (channel === "funda") {
    const passages = parsePassages(guide.content);
    const closing = closingPassages(passages, language, getFieldValue(property, "juridisch.verkoopclausules") as string | null);
    return fundaToHtml(texts.funda, language, streetLabel(property), closing);
  }
  if (channel === "website") return websiteToHtml(texts.website);
  return plainToHtml(channel === "facebook" ? texts.facebook.tekst : texts.instagram.tekst);
}

function seoFor(language: Language, seo: SeoOutput) {
  const s = seo[language];
  return {
    seo_title: s.seo_title.slice(0, 70),
    meta_description: s.meta_description.slice(0, 160),
    slug: slugify(s.slug) || null,
  };
}

function hashtagsFor(channel: Channel, language: Language, seo: SeoOutput, extra: string[]): string[] {
  const key = `${channel}_${language}` as keyof SeoOutput["hashtags"];
  const base = normalizeHashtags([...(seo.hashtags[key] ?? []), ...(channel === "facebook" || channel === "instagram" ? extra : [])]);
  if (!base.some((t) => t.toLowerCase() === "#korffdegidts")) base.unshift("#KorffdeGidts");
  const max = channel === "facebook" ? 6 : channel === "instagram" ? 8 : 6;
  return base.slice(0, max);
}

/**
 * Voert de volgende openstaande stap van een volledige generatie uit.
 * Elke stap is één afgebakende Claude-aanroep (ruim binnen de Vercel-limiet),
 * en het resultaat wordt direct in de job opgeslagen. Na een fout of
 * onderbreking gaat de job verder vanaf de mislukte stap, zonder dubbele records.
 */
export async function runNextGenerationStep(supabase: ServerSupabase, jobId: string): Promise<JobRow> {
  const claimed = await claimJob(supabase, jobId);
  if (!claimed) return getJob(supabase, jobId);
  if (claimed.job_type !== "volledige_generatie" || !claimed.property_id) {
    return failJob(supabase, jobId, new AppError("ongeldige_invoer", "Onjuist jobtype."));
  }
  const steps = (claimed.steps ?? {}) as Steps;
  const step = GENERATION_STEPS.find((s) => !(s in steps));
  if (!step) return updateJob(supabase, jobId, { status: "voltooid" });

  try {
    await updateJob(supabase, jobId, { currentStep: step });
    const { data: propertyData, error } = await supabase.from("properties").select("*").eq("id", claimed.property_id).single();
    if (error) throw fromDbError(error);
    const property = propertyData as PropertyRow;
    if (!claimed.style_guide_id) throw new AppError("configuratie", "Er is geen actieve schrijfwijzer.");
    // Alle stappen moeten op dezelfde gegevens gebaseerd zijn (NL en EN inhoudelijk gelijk).
    const style = await jobStyle(supabase, claimed);
    if (generationInputHash(property, claimed.style_guide_id, (claimed.params?.overwriteSlots as string[] | undefined) ?? [], style) !== claimed.input_hash) {
      throw new AppError("conflict", "De woninggegevens of de schrijfwijzer zijn gewijzigd sinds de start. Start de generatie opnieuw.");
    }
    const guide = await getStyleGuide(supabase, claimed.style_guide_id);
    const system = generationSystem(guideForPrompt(guide.content));
    const examples = step === "opslaan" ? "" : examplesForPrompt(await loadExamples(supabase, property.id));
    // Profiel + voorbeelden zijn voor alle stappen gelijk: één cache-breakpoint, zodat
    // stap 2 t/m 5 de systeeminstructie én deze context uit de prompt-cache lezen.
    const context: AiContentBlock = { type: "text", text: generationContext(profileForPrompt(property), examples), cache: true };
    const common = { supabase, propertyId: property.id, jobId, mockInput: mockProfile(property), system };
    const styleText = styleBlock(style);
    const task = (t: GenerationTask, data: string) => {
      // De gekozen schrijfstijl geldt voor het schrijven; de controle weet dat de stijl bewust is gekozen.
      const extra =
        styleText && (t === "nederlands" || t === "engels")
          ? `\n\n${styleText}${t === "engels" ? "\nPas deze schrijfstijl even uitgesproken toe in natuurlijk Engels." : ""}`
          : styleText && t === "controle"
            ? `\n\nDe teksten zijn bewust geschreven in de schrijfstijl "${style!.label}". Meld geen bevindingen over toon, lengte, clichés of zinsbouw die bij die stijl horen; controleer feiten, consistentie, privacy en juridische aspecten wel volledig.`
            : "";
      return `<taak>\n${GENERATION_TASKS[t]}\n</taak>${extra}${data ? `\n\n${data}` : ""}`;
    };

    let output: unknown;
    switch (step) {
      case "analyse": {
        const photos = await loadPhotos(supabase, property.id);
        const r = await callClaude({
          ...common,
          operation: "analyse",
          schema: analysisSchema,
          content: [
            context,
            ...photos,
            { type: "text", text: task("analyse", photos.length ? `Er zijn ${photos.length} foto's van de woning meegestuurd.` : "Er zijn geen foto's meegestuurd.") },
          ],
          maxTokens: 8000,
        });
        output = r.data;
        break;
      }
      case "nederlands": {
        const r = await callClaude({
          ...common,
          operation: "nederlands",
          schema: languageTextsSchema,
          content: [context, { type: "text", text: task("nederlands", `<analyse>\n${JSON.stringify(steps.analyse)}\n</analyse>`) }],
          maxTokens: 32000,
        });
        output = r.data;
        break;
      }
      case "engels": {
        const r = await callClaude({
          ...common,
          operation: "engels",
          schema: languageTextsSchema,
          content: [context, { type: "text", text: task("engels", `<teksten taal="nl">\n${JSON.stringify(steps.nederlands)}\n</teksten>`) }],
          maxTokens: 32000,
        });
        output = r.data;
        break;
      }
      case "seo": {
        const r = await callClaude({
          ...common,
          operation: "seo",
          schema: seoSchema,
          content: [
            context,
            {
              type: "text",
              text: task(
                "seo",
                `<teksten>\nNL website: ${JSON.stringify(steps.nederlands?.website)}\nEN website: ${JSON.stringify(steps.engels?.website)}\nNL instagram: ${steps.nederlands?.instagram.tekst}\n</teksten>`,
              ),
            },
          ],
          maxTokens: 6000,
          effort: "low",
          // SEO en hashtags vragen geen zwaar model; scheelt kosten.
          model: serverEnv().ANTHROPIC_LIGHT_MODEL,
        });
        output = r.data;
        break;
      }
      case "controle": {
        const nl = steps.nederlands!;
        const en = steps.engels!;
        const r = await callClaude({
          ...common,
          operation: "review",
          schema: reviewSchema,
          content: [
            context,
            {
              type: "text",
              text: task(
                "controle",
                `<analyse>\n${JSON.stringify({ foto_waarnemingen: steps.analyse?.foto_waarnemingen ?? [] })}\n</analyse>\n\n<teksten taal="nl">\n${textsAsPlain(nl)}\n</teksten>\n\n<teksten taal="en">\n${textsAsPlain(en)}\n</teksten>`,
              ),
            },
          ],
          maxTokens: 12000,
        });
        output = { ai: r.data, checks: deterministicChecks(property, guide, steps, style) };
        break;
      }
      case "opslaan": {
        output = await saveGeneratedTexts(supabase, claimed, property, guide, steps, style);
        break;
      }
    }

    const isLast = step === GENERATION_STEPS[GENERATION_STEPS.length - 1];
    return updateJob(supabase, jobId, {
      status: isLast ? "voltooid" : "wachtrij",
      currentStep: isLast ? "voltooid" : GENERATION_STEPS[GENERATION_STEPS.indexOf(step) + 1],
      steps: { [step]: output },
    });
  } catch (err) {
    return failJob(supabase, jobId, err);
  }
}

const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Maximaal aantal foto's per analyse en maximale bestandsgrootte (base64 blijft onder de API-limiet). */
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 3_700_000;

/** Foto's van de woning (alleen documenttype "foto") als beeldinvoer voor de analyse. */
async function loadPhotos(supabase: ServerSupabase, propertyId: string): Promise<AiContentBlock[]> {
  const { data, error } = await supabase
    .from("property_documents")
    .select("id, storage_path, mime_type, file_size")
    .eq("property_id", propertyId)
    .eq("document_type", "foto")
    .lte("file_size", MAX_PHOTO_BYTES)
    .order("created_at")
    .limit(MAX_PHOTOS * 2);
  if (error) throw fromDbError(error);
  const blocks: AiContentBlock[] = [];
  for (const doc of (data ?? []) as Pick<DocumentRow, "id" | "storage_path" | "mime_type" | "file_size">[]) {
    if (blocks.length >= MAX_PHOTOS || !PHOTO_MIME.has(doc.mime_type)) continue;
    const { data: blob, error: dlError } = await supabase.storage.from("property-documents").download(doc.storage_path);
    if (dlError || !blob) continue; // Een onleesbare foto mag de generatie niet blokkeren.
    blocks.push({
      type: "image",
      mediaType: doc.mime_type as "image/jpeg" | "image/png" | "image/webp",
      base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
    });
  }
  return blocks;
}

const EXAMPLE_SLOTS: { channel: Channel; language: Language }[] = [
  { channel: "funda", language: "nl" },
  { channel: "funda", language: "en" },
  { channel: "website", language: "nl" },
  { channel: "instagram", language: "nl" },
];

/**
 * Recent goedgekeurde teksten van ándere woningen van dezelfde organisatie (RLS)
 * als stijlvoorbeeld: zo leert het model de huisstijl van het kantoor zelf.
 */
export async function loadExamples(supabase: ServerSupabase, propertyId: string): Promise<ExampleText[]> {
  const { data, error } = await supabase
    .from("content_versions")
    .select("property_id, channel, language, content")
    .eq("status", "goedgekeurd")
    .neq("property_id", propertyId)
    .order("approved_at", { ascending: false })
    .limit(40);
  if (error) throw fromDbError(error);
  const picked: ExampleText[] = [];
  for (const slot of EXAMPLE_SLOTS) {
    const row = (data ?? []).find((r) => r.channel === slot.channel && r.language === slot.language);
    if (row) picked.push({ channel: slot.channel, language: slot.language, text: htmlToPlainText(row.content as string) });
  }
  return picked;
}

export function deterministicChecks(property: PropertyRow, guide: StyleGuideRow, steps: Steps, style: WritingStyleRow | null = null): Finding[] {
  const findings: Finding[] = [];
  const ctx = {
    forbiddenPhrases: forbiddenPhrases(guide.content),
    customStyle: style !== null,
    doNotMention: doNotMention(property, steps.analyse),
    allowedContacts: allowedContacts(property),
    priceOnSocial: getFieldValue(property, "publicatie.prijs_op_social") === true,
  };
  const extra = (getFieldValue(property, "publicatie.extra_hashtags") as string[] | null) ?? [];
  const html: Partial<Record<SlotKey, string>> = {};
  for (const { channel, language, key } of SLOTS) {
    const texts = language === "nl" ? steps.nederlands : steps.engels;
    if (!texts) continue;
    html[key] = buildSlotHtml(channel, language, texts, property, guide);
    const tags = steps.seo ? hashtagsFor(channel, language, steps.seo, extra) : [];
    findings.push(...checkText({ channel, language, html: html[key]!, hashtags: tags }, ctx));
  }
  for (const channel of ["funda", "website", "facebook", "instagram"] as Channel[]) {
    const nl = html[`${channel}:nl`];
    const en = html[`${channel}:en`];
    if (nl && en) findings.push(...compareLanguages(channel, nl, en));
  }
  return findings;
}

async function saveGeneratedTexts(
  supabase: ServerSupabase,
  job: JobRow,
  property: PropertyRow,
  guide: StyleGuideRow,
  steps: Steps,
  style: WritingStyleRow | null,
): Promise<{ saved: SlotKey[]; skipped: SlotKey[] }> {
  if (!steps.nederlands || !steps.engels || !steps.seo) throw new AppError("ai_fout", "Onvolledige generatieresultaten.");
  const overwrite = new Set(((job.params?.overwriteSlots as string[] | undefined) ?? []) as SlotKey[]);
  const latest = await latestVersions(supabase, property.id);
  const extra = (getFieldValue(property, "publicatie.extra_hashtags") as string[] | null) ?? [];

  // Idempotent: versies die deze job al heeft opgeslagen (bij een eerdere, onderbroken poging) worden niet opnieuw gemaakt.
  const { data: existingForJob, error: existingError } = await supabase
    .from("content_versions")
    .select("id, channel, language")
    .eq("generation_job_id", job.id);
  if (existingError) throw fromDbError(existingError);
  const already = new Map((existingForJob ?? []).map((r) => [`${r.channel}:${r.language}` as SlotKey, r.id as string]));

  const saved: SlotKey[] = [];
  const skipped: SlotKey[] = [];
  const versionIds: Partial<Record<SlotKey, string>> = Object.fromEntries(already);

  for (const { channel, language, key } of SLOTS) {
    if (already.has(key)) {
      saved.push(key);
      continue;
    }
    const current = latest.get(key);
    if (isProtected(current) && !overwrite.has(key)) {
      skipped.push(key);
      continue;
    }
    const texts = language === "nl" ? steps.nederlands : steps.engels;
    const seo = channel === "website" ? seoFor(language, steps.seo) : { seo_title: null, meta_description: null, slug: null };
    const { data, error } = await supabase.rpc("save_content_version", {
      p_property_id: property.id,
      p_channel: channel,
      p_language: language,
      p_content: buildSlotHtml(channel, language, texts, property, guide),
      p_source: "ai_generatie",
      p_expected_version: null,
      p_based_on_version_id: current?.id ?? null,
      p_seo_title: seo.seo_title,
      p_meta_description: seo.meta_description,
      p_slug: seo.slug,
      p_hashtags: hashtagsFor(channel, language, steps.seo, extra),
      p_generation_job_id: job.id,
      p_style_guide_id: guide.id,
      p_prompt_version: promptVersionWithStyle(PROMPT_VERSION, style),
    });
    if (error) throw fromDbError(error);
    versionIds[key] = (data as { id: string }).id;
    saved.push(key);
  }

  // Controlepunten: één keer per job.
  const { count } = await supabase.from("review_issues").select("id", { count: "exact", head: true }).eq("generation_job_id", job.id);
  if (!count) {
    const photoNotes = steps.analyse?.foto_waarnemingen ?? [];
    const issues = [
      ...(photoNotes.length
        ? [
            {
              severity: "info" as const,
              category: "foto",
              field_name: null as string | null,
              description: `De teksten kunnen sfeerbeschrijvingen bevatten die zijn afgeleid van foto's. Controleer of deze kloppen: ${photoNotes.map((n) => `${n.ruimte}: ${n.waarneming}`).join("; ")}`,
              source_details: null as string | null,
              slot: null as SlotKey | null,
            },
          ]
        : []),
      ...(steps.analyse?.ontbrekende_gegevens ?? []).map((m) => ({
        severity: m.ernst,
        category: "ontbrekend",
        field_name: m.veld.slice(0, 120),
        description: m.toelichting,
        source_details: null as string | null,
        slot: null as SlotKey | null,
      })),
      ...(steps.controle?.ai.bevindingen ?? []).map((b) => ({
        severity: b.ernst,
        category: b.categorie,
        field_name: null,
        description: b.omschrijving,
        source_details: b.bron || null,
        slot: b.kanaal !== "algemeen" && b.taal !== "beide" ? (`${b.kanaal}:${b.taal}` as SlotKey) : null,
      })),
      ...(steps.controle?.checks ?? []).map((c) => ({
        severity: c.severity,
        category: c.category,
        field_name: null,
        description: c.description,
        source_details: c.source ?? null,
        slot: c.channel !== "algemeen" && c.language !== "beide" ? (`${c.channel}:${c.language}` as SlotKey) : null,
      })),
    ];
    if (issues.length) {
      const { error } = await supabase.from("review_issues").insert(
        issues.slice(0, 120).map((i) => ({
          property_id: property.id,
          organization_id: property.organization_id,
          generation_job_id: job.id,
          content_version_id: i.slot ? (versionIds[i.slot] ?? null) : null,
          severity: i.severity,
          category: i.category.slice(0, 60),
          field_name: i.field_name,
          description: i.description.slice(0, 2000),
          source_details: i.source_details?.slice(0, 2000) ?? null,
        })),
      );
      if (error) throw fromDbError(error);
    }
  }
  return { saved, skipped };
}

/** Teksten die bij volledige generatie beschermd zijn (voor de waarschuwingsdialoog). */
export async function protectedSlots(supabase: ServerSupabase, propertyId: string): Promise<SlotKey[]> {
  const latest = await latestVersions(supabase, propertyId);
  return [...latest.entries()].filter(([, v]) => isProtected(v)).map(([k]) => k);
}

export function stepOutputsPlain(steps: Steps): string {
  return steps.nederlands ? htmlToPlainText(textsAsPlain(steps.nederlands)) : "";
}
