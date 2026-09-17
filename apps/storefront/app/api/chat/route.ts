import { mistral } from "@ai-sdk/mistral";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { resolveModel } from "lib/ai/models";
import { createTools, type AssistantUIMessage } from "lib/ai/tools";
import { DEMO_USER } from "lib/demo-user";

export const maxDuration = 30;

const instructions =
  "You are the shopping assistant for Acme Store. " +
  "Use searchProducts to find products (search with product-type keywords " +
  'like "hoodie" or "mug", or browse a collection), getProduct for one ' +
  "specific product, and getAccountInfo for anything about the customer's " +
  "account, orders, or loyalty points. Use refundOrder when the customer " +
  "asks to refund or return an order - confirm which order first, then call " +
  "it with the order id. If refundOrder errors, apologize briefly and say " +
  "the team has been notified; never retry it. Tool results render as rich cards in " +
  "the chat, so never repeat prices or product details in your text - add " +
  "one short, helpful sentence around the cards instead. Prices are in USD. " +
  "Be concise and friendly.";

export async function POST(req: Request) {
  const { id, messages }: { id?: string; messages: AssistantUIMessage[] } =
    await req.json();

  const result = streamText({
    model: mistral(resolveModel()),
    instructions,
    messages: await convertToModelMessages(messages),
    tools: createTools(DEMO_USER.id, id),
    stopWhen: isStepCount(5),
    // functionId names the agent in the AI SDK's telemetry.
    telemetry: {
      functionId: "shopping-assistant",
    },
    // Repeated turns in one conversation share the cache prefix.
    providerOptions: {
      mistral: { promptCacheKey: id ?? "shopping-assistant" },
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: () => "The shopping assistant hit an error. Please try again.",
    }),
  });
}
