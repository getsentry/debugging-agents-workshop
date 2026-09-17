import { mistral } from "@ai-sdk/mistral";
import { generateText, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { resolveModel } from "lib/ai/models";
import { createTools } from "lib/ai/tools";
import { DEMO_USER } from "lib/demo-user";

// Same guidance as the storefront's chat route, adapted for plain Slack
// text: tool results don't render as cards here, so the assistant has to
// spell out the details itself.
const instructions =
  "You are the shopping assistant for Acme Store, answering in Slack. " +
  "Use searchProducts to find products (search with product-type keywords " +
  'like "hoodie" or "mug", or browse a collection), getProduct for one ' +
  "specific product, and getAccountInfo for anything about the customer's " +
  "account, orders, or loyalty points. Use refundOrder when the customer " +
  "asks to refund or return an order - confirm which order first, then call " +
  "it with the order id. If refundOrder errors, apologize briefly and say " +
  "the team has been notified; never retry it. Tool results do not render " +
  "as cards here, so summarize them yourself: name each product and its " +
  "price, or each order's id, status, and total. Prices are in USD. Format " +
  "for Slack, not markdown - use *asterisks* for bold and never headings. " +
  "Be concise and friendly.";

export async function answer({
  messages,
  conversationId,
}: {
  messages: ModelMessage[];
  conversationId: string;
}): Promise<string> {
  const result = await generateText({
    model: mistral(resolveModel()),
    instructions,
    messages,
    tools: createTools(DEMO_USER.id, conversationId),
    stopWhen: isStepCount(5),
    // functionId names the agent in the AI SDK's telemetry.
    telemetry: {
      functionId: "slack-shopping-assistant",
    },
    // Repeated turns in one conversation share the cache prefix.
    providerOptions: {
      mistral: { promptCacheKey: conversationId },
    },
  });

  return result.text;
}
