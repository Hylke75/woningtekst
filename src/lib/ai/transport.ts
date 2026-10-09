import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { mockComplete } from "@/lib/ai/mock";

export type AiContentBlock =
  /** cache: markeer als prompt-cache-breakpoint (stabiele, herbruikte data zoals profiel en voorbeelden). */
  | { type: "text"; text: string; cache?: boolean }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type AiRequest = {
  operation: string;
  model: string;
  system: string;
  content: AiContentBlock[];
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs: number;
  /** Alleen voor de deterministische testmodus. */
  mockInput?: unknown;
};

export type AiResponse = {
  text: string;
  model: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens?: number };
};

export interface AiTransport {
  complete(req: AiRequest): Promise<AiResponse>;
}

class AnthropicTransport implements AiTransport {
  private client: Anthropic;
  constructor(apiKey: string, private fallbacks: "default" | "off", workspaceId?: string) {
    // maxRetries: de SDK herhaalt 408/409/429/5xx en verbindingsfouten met exponentiële backoff.
    this.client = new Anthropic({
      apiKey,
      maxRetries: 3,
      ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
    });
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    // De systeeminstructie (incl. schrijfwijzer) is per versie stabiel: altijd cachen.
    const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = req.content.map((b) =>
      b.type === "text"
        ? { type: "text", text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}) }
        : { type: "image", source: { type: "base64", media_type: b.mediaType, data: b.base64 } },
    );
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system,
          messages: [{ role: "user", content }],
          thinking: { type: "adaptive" },
          output_config: { effort: req.effort, format: { type: "json_schema", schema: req.jsonSchema } },
          ...(this.fallbacks === "default"
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        },
        { timeout: req.timeoutMs },
      );
      const message = await stream.finalMessage();
      const text = message.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        model: message.model,
        stopReason: message.stop_reason,
        usage: {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
          cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }
}

export function mapAnthropicError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AppError("ai_timeout", "Claude reageerde niet op tijd. Probeer het opnieuw.", 504, true);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError("ai_fout", "Claude is tijdelijk overbelast. Probeer het over een minuut opnieuw.", 503, true);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError("ai_niet_geconfigureerd", "De koppeling met Claude is niet correct geconfigureerd.", 503, false);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AppError("ai_fout", "Claude kon dit verzoek niet verwerken.", 502, false);
  }
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
    return new AppError("ai_fout", "Claude is tijdelijk niet bereikbaar. Probeer het opnieuw.", 503, true);
  }
  if (err instanceof Anthropic.APIUserAbortError) {
    return new AppError("ai_timeout", "Het verzoek aan Claude is afgebroken.", 504, true);
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError("ai_fout", "Claude gaf een onverwachte fout.", 502, true);
  }
  return new AppError("ai_fout", "Onverwachte fout bij het aanroepen van Claude.", 502, true);
}

class MockTransport implements AiTransport {
  async complete(req: AiRequest): Promise<AiResponse> {
    return mockComplete(req);
  }
}

let override: AiTransport | null = null;

/** Alleen voor tests: injecteer een eigen transport. */
export function setAiTransportForTests(t: AiTransport | null) {
  override = t;
}

export function getAiTransport(): AiTransport {
  if (override) return override;
  const env = serverEnv();
  if (env.AI_MOCK) return new MockTransport();
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError("ai_niet_geconfigureerd", "Claude is nog niet gekoppeld: ANTHROPIC_API_KEY ontbreekt in de serverconfiguratie.", 503);
  }
  return new AnthropicTransport(env.ANTHROPIC_API_KEY, env.ANTHROPIC_FALLBACKS, env.ANTHROPIC_WORKSPACE_ID);
}
