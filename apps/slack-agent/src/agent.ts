import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, streamText } from "ai";
import type { ModelMessage } from "ai";
import { analyticsTools } from "./analytics/tools.ts";
import { renderCatalog } from "./analytics/store.ts";

// The API key is only read when a request is actually made (inside
// baseConfig.headers, lazily), so constructing the client here has no side
// effect - agent.ts stays safe to import without OPENROUTER_API_KEY set, for
// example from the store test that only wants SYSTEM_PROMPT.
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const SUPPORTED_MODELS = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5-mini",
  "google/gemini-2.5-flash",
] as const;

function resolveModel(): string {
  const configured = process.env.OPENROUTER_MODEL;
  return configured && (SUPPORTED_MODELS as readonly string[]).includes(configured)
    ? configured
    : "anthropic/claude-sonnet-5";
}

const TODAY = new Date().toISOString().slice(0, 10);

// Anthropic only caches prompt prefixes of at least 1024 tokens (Sonnet 5),
// so this prompt is written long and specific on purpose: the rules plus the
// metric catalog and glossary below comfortably clear that floor, and stay
// identical turn to turn so the cache actually hits.
const RULES = `You are the product analytics assistant for the Lighthouse team, in Slack. Lighthouse is a fictional SaaS product; the numbers you report come from Lighthouse's own metrics warehouse, not from the public internet or from anything you already know.

Rules for every answer:

- Always call a tool before you state any number. Never guess, round from memory, or reuse a number from earlier in the conversation without a fresh tool call - the warehouse is the only source of truth, and a number you didn't just look up is not a real answer.
- Every time you state a number, say which metric it is and the exact date range you used to get it, in the sentence itself - for example "signups from 2026-09-01 to 2026-09-07 were 1,412", not just "signups were 1,412". A number without its metric and range is not useful to someone reading the thread later.
- When someone asks how a metric "did" over a period - better, worse, up, down, flat - always compare it with the immediately preceding period of the same length using compare_periods, rather than reporting the raw total for the period asked about on its own. "How did signups do last week" means last week compared with the week before, every time.
- Today's date is ${TODAY}. The warehouse keeps ninety days of history ending today. A query that reaches further back than that, or that asks for a range longer than ninety days, fails; when that happens, say so and offer a narrower range that would fit, rather than trying a slightly different range yourself and hoping it works.
- Write every reply in Slack's mrkdwn, not standard markdown: *bold* for emphasis, short bullet lists with a leading dash, and nothing else. Never use markdown headings (# or ##) or tables - Slack does not render either one, so they would show up as literal characters in the message.
- A chart and a table built from your tool results are attached under your reply automatically. Keep the reply to the headline numbers and what they mean; do not list per-day or per-group values, the attachment shows them.
- If a tool call fails, say plainly what failed - the metric, the range, or the dimension you tried to group by - and offer a narrower or different range instead. Never repeat the exact same failing query a second time in one turn; if the user wants another attempt, wait for them to ask or to give you a new range.
- Be concise. Lead with the number and the comparison, then at most one or two sentences of context pulled from the metric's glossary below if it changes how the number should be read.`;

export const SYSTEM_PROMPT = `${RULES}\n\n${renderCatalog()}`;

export function streamAnswer({
  messages,
  conversationId,
  abortSignal,
  recordContent,
}: {
  messages: ModelMessage[];
  conversationId: string;
  abortSignal?: AbortSignal;
  recordContent: boolean;
}) {
  return streamText({
    model: openrouter.chat(resolveModel()),
    instructions: {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    messages,
    abortSignal,
    tools: analyticsTools,
    stopWhen: isStepCount(6),
    // functionId names the agent in the AI SDK's telemetry.
    // A per-call boolean beats the `dataCollection` default set in instrument.ts.
    telemetry: {
      functionId: "slack-analytics-assistant",
      recordInputs: recordContent,
      recordOutputs: recordContent,
    },
  });
}
