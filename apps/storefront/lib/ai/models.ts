import { z } from "zod";

// Models the assistant is allowed to run, as OpenRouter ids. Each id also
// exists at https://openrouter.ai/api/v1/models, which is where the AI
// SDK's gen_ai.cost.* attributes get their pricing.
export const SUPPORTED_MODELS = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5-mini",
  "google/gemini-2.5-flash",
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export const DEFAULT_MODEL: SupportedModel = "anthropic/claude-sonnet-5";

const supportedModel = z.enum(SUPPORTED_MODELS);

// OPENROUTER_MODEL is an untrusted string, so it goes through a parse: an id
// outside the allow-list falls back to the default instead of reaching
// OpenRouter unvalidated.
export function resolveModel(): SupportedModel {
  const configured = supportedModel.safeParse(process.env.OPENROUTER_MODEL);
  return configured.success ? configured.data : DEFAULT_MODEL;
}
