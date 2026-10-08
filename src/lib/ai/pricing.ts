/**
 * Tarieven in USD per miljoen tokens (Anthropic first-party API, peildatum 2026-10).
 * Gebruikt voor een GESCHATTE kostenregistratie; de factuur van Anthropic is leidend.
 */
type Price = { input: number; output: number; cacheRead: number };

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};

const FALLBACK: Price = PRICES["claude-opus-5-5"];

export function priceFor(model: string): Price {
  return PRICES[model] ?? FALLBACK;
}

export function estimateCostEur(
  model: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null },
  usdToEur: number,
): number {
  const p = priceFor(model);
  const usd =
    (usage.input_tokens * p.input + usage.output_tokens * p.output + (usage.cache_read_input_tokens ?? 0) * p.cacheRead) / 1_000_000;
  return Math.round(usd * usdToEur * 1_000_000) / 1_000_000;
}
