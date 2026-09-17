import { z } from "zod";

// Models the assistant is allowed to run, as Mistral ids.
export const SUPPORTED_MODELS = [
  "mistral-small-latest",
  "mistral-medium-latest",
  "mistral-large-latest",
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export const DEFAULT_MODEL: SupportedModel = "mistral-small-latest";

const supportedModel = z.enum(SUPPORTED_MODELS);

// MISTRAL_MODEL is an untrusted string, so it goes through a parse: an id
// outside the allow-list falls back to the default instead of reaching
// Mistral unvalidated.
export function resolveModel(): SupportedModel {
  const configured = supportedModel.safeParse(process.env.MISTRAL_MODEL);
  return configured.success ? configured.data : DEFAULT_MODEL;
}
