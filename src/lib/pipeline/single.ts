import "server-only";
import { callClaude } from "@/lib/ai/call";
import {
  PROMPT_VERSION,
  profileForPrompt,
  rewriteSystem,
  singleRegenerationSystem,
  textReviewSystem,
  type RewriteMode,
} from "@/lib/ai/prompts";
import { rewriteSchema, singleFundaSchema, singleSocialSchema, singleWebsiteSchema, textReviewSchema, type TextReviewOutput } from "@/lib/ai/schemas";
import { closingPassages, forbiddenPhrases, guideForPrompt, parsePassages } from "@/lib/content/style-guide";
import { fundaToHtml, htmlToPlainText, plainToHtml, sanitizeContentHtml, websiteToHtml } from "@/lib/content/html";
import { checkText } from "@/lib/content/validators";
import { getFieldValue, streetLabel } from "@/lib/domain/property-mapping";
import { AppError, fromDbError } from "@/lib/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Channel, ContentVersionRow, JobRow, Language, PropertyRow } from "@/lib/db-types";
import type { SessionContext } from "@/lib/auth/session";
import { getActiveStyleGuide, latestVersions } from "@/lib/data/content";
import { claimJob, createOrGetJob, failJob, hashInput, updateJob } from "@/lib/pipeline/jobs";
import { mockProfile } from "@/lib/pipeline/generation";
import { serverEnv } from "@/lib/env";
import { promptVersionWithStyle, styleBlock, type WritingStyle } from "@/lib/content/writing-styles";

/** Korte social-teksten gaan via het lichtere model; Funda en website via het hoofdmodel. */
function modelFor(channel: Channel): string | undefined {
  return channel === "facebook" || channel === "instagram" ? serverEnv().ANTHROPIC_LIGHT_MODEL : undefined;
}

type SingleArgs = {
  supabase: ServerSupabase;
  session: SessionContext;
  property: PropertyRow;
  channel: Channel;
  language: Language;
  idempotencyKey: string;
  /** Laatste versie die de gebruiker kende; voorkomt dat een tussentijdse wijziging ongemerkt wordt overgeslagen. */
  expectedVersion: number | null;
};

async function runSingleJob<T>(
  supabase: ServerSupabase,
  job: JobRow,
  created: boolean,
  work: () => Promise<T>,
): Promise<{ job: JobRow; result: T | null }> {
  if (!created && job.status === "voltooid") return { job, result: (job.steps as { result?: T }).result ?? null };
  const claimed = await claimJob(supabase, job.id);
  if (!claimed) throw new AppError("conflict", "Dit verzoek wordt al verwerkt.");
  try {
    const result = await work();
    const done = await updateJob(supabase, job.id, { status: "voltooid", currentStep: "voltooid", steps: { result } });
    return { job: done, result };
  } catch (err) {
    await failJob(supabase, job.id, err);
    throw err;
  }
}

function slotHtmlFromOutput(
  channel: Channel,
  language: Language,
  output: unknown,
  property: PropertyRow,
  guideContent: string,
): string {
  if (channel === "funda") {
    const f = singleFundaSchema.parse(output).funda;
    const closing = closingPassages(parsePassages(guideContent), language, getFieldValue(property, "juridisch.verkoopclausules") as string | null);
    return fundaToHtml(f, language, streetLabel(property), closing);
  }
  if (channel === "website") return websiteToHtml(singleWebsiteSchema.parse(output).website);
  return plainToHtml(singleSocialSchema.parse(output).tekst);
}

async function saveVersion(
  supabase: ServerSupabase,
  args: {
    property: PropertyRow;
    channel: Channel;
    language: Language;
    html: string;
    source: "ai_generatie" | "ai_herschrijving";
    base: ContentVersionRow | undefined;
    expectedVersion: number | null;
    jobId: string;
    styleGuideId: string;
    style?: WritingStyle;
  },
): Promise<ContentVersionRow> {
  const { data, error } = await supabase.rpc("save_content_version", {
    p_property_id: args.property.id,
    p_channel: args.channel,
    p_language: args.language,
    p_content: args.html,
    p_source: args.source,
    p_expected_version: args.expectedVersion ?? args.base?.version_number ?? 0,
    p_based_on_version_id: args.base?.id ?? null,
    // SEO en hashtags blijven behouden bij het vernieuwen van de tekst
    p_seo_title: args.base?.seo_title ?? null,
    p_meta_description: args.base?.meta_description ?? null,
    p_slug: args.base?.slug ?? null,
    p_hashtags: args.base?.hashtags ?? [],
    p_generation_job_id: args.jobId,
    p_style_guide_id: args.styleGuideId,
    p_prompt_version: promptVersionWithStyle(PROMPT_VERSION, args.style ?? "schrijfwijzer"),
  });
  if (error) throw fromDbError(error);
  return data as ContentVersionRow;
}

async function recordChecks(
  supabase: ServerSupabase,
  property: PropertyRow,
  version: ContentVersionRow,
  guideContent: string,
  jobId: string,
  style: WritingStyle = "schrijfwijzer",
) {
  const findings = checkText(
    { channel: version.channel, language: version.language, html: version.content, hashtags: version.hashtags },
    {
      forbiddenPhrases: forbiddenPhrases(guideContent),
      customStyle: style !== "schrijfwijzer",
      doNotMention: String(getFieldValue(property, "positionering.niet_noemen") ?? "")
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3 && s.length <= 80),
      allowedContacts: [getFieldValue(property, "publicatie.telefoon"), getFieldValue(property, "publicatie.email")].filter(Boolean).map(String),
      priceOnSocial: getFieldValue(property, "publicatie.prijs_op_social") === true,
    },
  ).filter((f) => f.severity !== "info");
  if (!findings.length) return;
  const { error } = await supabase.from("review_issues").insert(
    findings.map((f) => ({
      property_id: property.id,
      organization_id: property.organization_id,
      generation_job_id: jobId,
      content_version_id: version.id,
      severity: f.severity,
      category: f.category,
      description: f.description,
      source_details: f.source ?? null,
    })),
  );
  if (error) throw fromDbError(error);
}

/** Genereert één tekst opnieuw; andere teksten blijven onaangeroerd. */
export async function regenerateOne(args: SingleArgs & { instruction?: string; schrijfstijl?: WritingStyle }) {
  const { supabase, session, property, channel, language } = args;
  const style = args.schrijfstijl ?? "schrijfwijzer";
  const guide = await getActiveStyleGuide(supabase);
  const latest = await latestVersions(supabase, property.id);
  const current = latest.get(`${channel}:${language}`);
  const counterpart = latest.get(`${channel}:${language === "nl" ? "en" : "nl"}`);
  const { job, created } = await createOrGetJob(supabase, {
    organizationId: session.organizationId,
    userId: session.userId,
    propertyId: property.id,
    jobType: "enkele_hergeneratie",
    idempotencyKey: args.idempotencyKey,
    params: { channel, language, instruction: args.instruction ?? null, schrijfstijl: style },
    inputHash: hashInput({ p: property.updated_at, channel, language, instruction: args.instruction, g: guide.id, s: style }),
  });
  const schema = channel === "funda" ? singleFundaSchema : channel === "website" ? singleWebsiteSchema : singleSocialSchema;
  return runSingleJob(supabase, job, created, async () => {
    const r = await callClaude({
      supabase,
      operation: "hergeneratie",
      schema,
      system: singleRegenerationSystem(guideForPrompt(guide.content), language),
      content: [
        {
          type: "text",
          text: [
            profileForPrompt(property),
            `<opdracht>Kanaal: ${channel}. Taal: ${language === "nl" ? "Nederlands" : "Engels"}.</opdracht>`,
            current ? `<huidige_tekst>\n${htmlToPlainText(current.content)}\n</huidige_tekst>` : "",
            counterpart ? `<tegenhanger>\n${htmlToPlainText(counterpart.content)}\n</tegenhanger>` : "",
            args.instruction ? `<instructie>\n${args.instruction}\n</instructie>` : "",
            styleBlock(style),
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      propertyId: property.id,
      jobId: job.id,
      maxTokens: channel === "funda" ? 24000 : 8000,
      model: modelFor(channel),
      mockInput: { ...mockProfile(property), channel, language },
    });
    const html = slotHtmlFromOutput(channel, language, r.data, property, guide.content);
    const version = await saveVersion(supabase, {
      property,
      channel,
      language,
      html,
      source: "ai_generatie",
      base: current,
      expectedVersion: args.expectedVersion,
      jobId: job.id,
      styleGuideId: guide.id,
      style,
    });
    await recordChecks(supabase, property, version, guide.content, job.id, style);
    return { versionId: version.id, versionNumber: version.version_number };
  });
}

/** Korter, uitgebreider, zakelijker, persoonlijker, natuurlijker of een variant met andere invalshoek. Werkt op de laatst opgeslagen versie. */
export async function rewriteText(args: SingleArgs & { mode: RewriteMode }) {
  const { supabase, session, property, channel, language, mode } = args;
  const guide = await getActiveStyleGuide(supabase);
  const latest = await latestVersions(supabase, property.id);
  const current = latest.get(`${channel}:${language}`);
  if (!current) throw new AppError("ongeldige_invoer", "Er is nog geen tekst om te herschrijven.");
  if (args.expectedVersion !== null && current.version_number !== args.expectedVersion) {
    throw new AppError("versieconflict", "Er is intussen een nieuwere versie opgeslagen. Laad de tekst opnieuw.");
  }
  const { job, created } = await createOrGetJob(supabase, {
    organizationId: session.organizationId,
    userId: session.userId,
    propertyId: property.id,
    jobType: "herschrijving",
    idempotencyKey: args.idempotencyKey,
    params: { channel, language, mode, baseVersionId: current.id },
    inputHash: hashInput({ v: current.id, mode }),
  });
  return runSingleJob(supabase, job, created, async () => {
    const r = await callClaude({
      supabase,
      operation: "herschrijving",
      schema: rewriteSchema,
      system: rewriteSystem(guideForPrompt(guide.content), mode),
      content: [{ type: "text", text: `${profileForPrompt(property)}\n\n<tekst>\n${current.content}\n</tekst>` }],
      propertyId: property.id,
      jobId: job.id,
      maxTokens: channel === "funda" ? 24000 : 8000,
      model: modelFor(channel),
      mockInput: mockProfile(property),
    });
    const html = sanitizeContentHtml(r.data.html);
    if (!html) throw new AppError("ai_ongeldig_antwoord", "De herschreven tekst was leeg.");
    const version = await saveVersion(supabase, {
      property,
      channel,
      language,
      html,
      source: "ai_herschrijving",
      base: current,
      expectedVersion: current.version_number,
      jobId: job.id,
      styleGuideId: guide.id,
    });
    await recordChecks(supabase, property, version, guide.content, job.id);
    return { versionId: version.id, versionNumber: version.version_number, note: r.data.toelichting };
  });
}

/**
 * 'Controleer deze tekst': redactionele controle zonder automatische wijziging.
 * Werkt op de inhoud uit de editor (ook als die nog niet is opgeslagen).
 */
export async function reviewText(args: Omit<SingleArgs, "expectedVersion"> & { html: string }) {
  const { supabase, session, property, channel, language } = args;
  const guide = await getActiveStyleGuide(supabase);
  const html = sanitizeContentHtml(args.html);
  if (!html) throw new AppError("ongeldige_invoer", "De tekst is leeg.");
  const { job, created } = await createOrGetJob(supabase, {
    organizationId: session.organizationId,
    userId: session.userId,
    propertyId: property.id,
    jobType: "tekstcontrole",
    idempotencyKey: args.idempotencyKey,
    params: { channel, language },
    inputHash: hashInput({ html, p: property.updated_at }),
  });
  const { result } = await runSingleJob<TextReviewOutput>(supabase, job, created, async () => {
    const r = await callClaude({
      supabase,
      operation: "tekstcontrole",
      schema: textReviewSchema,
      system: textReviewSystem(guideForPrompt(guide.content)),
      content: [
        {
          type: "text",
          text: `${profileForPrompt(property)}\n\n<opdracht>Kanaal: ${channel}. Taal: ${language === "nl" ? "Nederlands" : "Engels"}.</opdracht>\n\n<tekst>\n${html}\n</tekst>`,
        },
      ],
      propertyId: property.id,
      jobId: job.id,
      maxTokens: 10000,
      mockInput: mockProfile(property),
    });
    // Alleen voorstellen waarvan het fragment letterlijk in de tekst voorkomt, zijn toepasbaar.
    const plain = htmlToPlainText(html);
    return { ...r.data, voorstellen: r.data.voorstellen.filter((v) => plain.includes(v.origineel) || html.includes(v.origineel)) };
  });
  return result ?? { oordeel: "", voorstellen: [] };
}
