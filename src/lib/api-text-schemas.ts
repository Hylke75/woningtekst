import { z } from "zod";
import { idempotencyKeySchema } from "@/lib/api";
import { WRITING_STYLE_KEYS } from "@/lib/content/writing-styles";

export const channelSchema = z.enum(["funda", "website", "facebook", "instagram"]);
export const languageSchema = z.enum(["nl", "en"]);

export const regenerateBody = z.object({
  idempotencyKey: idempotencyKeySchema,
  channel: channelSchema,
  language: languageSchema,
  expectedVersion: z.number().int().min(0).nullable(),
  instruction: z.string().trim().max(1000).optional(),
  schrijfstijl: z.enum(WRITING_STYLE_KEYS).default("schrijfwijzer"),
});

export const rewriteBody = z.object({
  idempotencyKey: idempotencyKeySchema,
  channel: channelSchema,
  language: languageSchema,
  expectedVersion: z.number().int().min(0).nullable(),
  mode: z.enum(["korter", "uitgebreider", "zakelijker", "persoonlijker", "natuurlijker", "andere_invalshoek"]),
});

export const reviewBody = z.object({
  idempotencyKey: idempotencyKeySchema,
  channel: channelSchema,
  language: languageSchema,
  html: z.string().min(1).max(60000),
});
