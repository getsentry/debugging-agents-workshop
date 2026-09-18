import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, streamText } from "ai";
import type { ModelMessage } from "ai";
import { PROMPT_CACHE_OPTIONS, STORE_POLICIES } from "lib/ai/instructions";
import { resolveModel } from "lib/ai/models";
import { createTools } from "lib/ai/tools";
import { DEMO_USER } from "lib/demo-user";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

// Same guidance as the storefront's chat route, adapted for Slack: app.ts
// adds a card for each product whose exact title is in the reply, and orders
// have no cards, so the assistant spells those out itself.
const assistantInstructions =
  "You are the shopping assistant for Acme Store, answering in Slack. " +
  "Use searchProducts to find products (search with product-type keywords " +
  'like "hoodie" or "mug", or browse a collection), getProduct for one ' +
  "specific product, and getAccountInfo for anything about the customer's " +
  "account, orders, or loyalty points. Use refundOrder when the customer " +
  "asks to refund or return an order - confirm which order first, then call " +
  "it with the order id. If refundOrder errors, apologize briefly and say " +
  "the team has been notified; never retry it. Each product you name by " +
  "its exact title gets a card with its price and description under your " +
  "reply, so name the products in one short sentence and do not list their " +
  "details. Orders have no cards: give each order's id, status, and total. " +
  "Prices are in USD. " +
  "Format with standard markdown: **bold** for emphasis and short bullet " +
  "lists, never headings or tables. " +
  "Be concise and friendly.";

// Labels shown next to each tool's task_update chunk while it runs, so
// Slack's task timeline reads like a sentence instead of a function name.
export const TOOL_TITLES: Record<string, string> = {
  searchProducts: "Searching the catalog",
  getProduct: "Looking up the product",
  getAccountInfo: "Checking the account",
  refundOrder: "Processing the refund",
};

export function streamAnswer({
  messages,
  conversationId,
}: {
  messages: ModelMessage[];
  conversationId: string;
}) {
  return streamText({
    model: openrouter.chat(resolveModel()),
    instructions: {
      role: "system",
      content: `${assistantInstructions}\n\n${STORE_POLICIES}`,
      providerOptions: PROMPT_CACHE_OPTIONS,
    },
    messages,
    tools: createTools(DEMO_USER.id, conversationId),
    stopWhen: isStepCount(5),
    // functionId names the agent in the AI SDK's telemetry.
    telemetry: {
      functionId: "slack-shopping-assistant",
    },
  });
}
