import { App } from "@slack/bolt";
import type { SayFn, SayStreamFn, SetStatusFn } from "@slack/bolt";
import type { BlockFeedbackButtonsAction } from "@slack/bolt";
import type {
  AppMentionEvent,
  CarouselBlock,
  KnownBlock,
  MessageEvent,
} from "@slack/types";
import type { WebClient } from "@slack/web-api";
import type { ModelMessage } from "ai";
import type { ProductCard } from "lib/ai/tools";
import { streamAnswer, TOOL_TITLES } from "./agent";

const required = [
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "OPENROUTER_API_KEY",
  "DATABASE_URL",
] as const;

for (const name of required) {
  if (!process.env[name]) {
    console.error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
    process.exit(1);
  }
}

const ERROR_REPLY = "The shopping assistant hit an error. Please try again.";

const FEEDBACK_BLOCK: KnownBlock[] = [
  {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "AI-generated. Check order details before you act on them.",
      },
    ],
  },
  {
    type: "context_actions",
    elements: [
      {
        type: "feedback_buttons",
        action_id: "feedback",
        positive_button: {
          text: { type: "plain_text", text: "Good" },
          value: "positive",
        },
        negative_button: {
          text: { type: "plain_text", text: "Bad" },
          value: "negative",
        },
      },
    ],
  },
];

// Shopping-flavored status lines shown while the assistant is thinking.
const LOADING_MESSAGES = [
  "Checking the shelves...",
  "Reading the order book...",
  "Counting loyalty points...",
  "Fetching product details...",
];

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

async function respond({
  client,
  event,
  text,
  sayStream,
  setStatus,
  say,
}: {
  client: WebClient;
  event: { channel: string; ts: string; thread_ts?: string; user?: string };
  text: string;
  sayStream: SayStreamFn;
  setStatus: SetStatusFn;
  say: SayFn;
}) {
  const conversationId = event.thread_ts ?? event.ts;
  let stream: ReturnType<SayStreamFn> | undefined;

  try {
    await setStatus({
      status: "is thinking...",
      loading_messages: LOADING_MESSAGES,
    }).catch((error) => console.warn("setStatus failed", error));

    const messages = await loadThread({ client, event, conversationId, text });

    stream = sayStream({ task_display_mode: "timeline" });

    const taskStatus = {
      "tool-call": "in_progress",
      "tool-result": "complete",
      "tool-error": "error",
    } as const;

    let reply = "";
    const found = new Map<string, ProductCard>();

    for await (const part of streamAnswer({ messages, conversationId })
      .fullStream) {
      switch (part.type) {
        case "text-delta":
          reply += part.text;
          await stream.append({ markdown_text: part.text });
          break;
        case "tool-call":
        case "tool-result":
        case "tool-error":
          await stream.append({
            chunks: [
              {
                type: "task_update",
                id: part.toolCallId,
                title: TOOL_TITLES[part.toolName] ?? part.toolName,
                status: taskStatus[part.type],
              },
            ],
          });
          if (part.type === "tool-result" && !part.dynamic) {
            if (part.toolName === "searchProducts") {
              for (const p of part.output.products) found.set(p.handle, p);
            } else if (part.toolName === "getProduct" && part.output.product) {
              found.set(part.output.product.handle, part.output.product);
            }
          }
          break;
        case "error":
          throw part.error;
        default:
          break;
      }
    }

    // A search returns up to six products and the model often picks a few
    // (for example "under $60"), so show only the ones the reply names.
    const products = [...found.values()].filter((p) => reply.includes(p.title));
    await stream.stop({
      blocks: [...productCarousel(products), ...FEEDBACK_BLOCK],
    });
  } catch (error) {
    if (stream) {
      await stream.stop({ markdown_text: ERROR_REPLY });
    } else {
      await say({ text: ERROR_REPLY, thread_ts: conversationId });
    }
    throw error;
  } finally {
    // Slack's agent messaging experience keeps the status until the app
    // clears it; the older assistant experience cleared it on the reply.
    await setStatus("").catch((error) =>
      console.warn("setStatus failed", error),
    );
  }
}

app.event(
  "app_mention",
  async ({
    event,
    say,
    sayStream,
    setStatus,
    client,
  }: {
    event: AppMentionEvent;
    say: SayFn;
    sayStream: SayStreamFn;
    setStatus: SetStatusFn;
    client: WebClient;
  }) => {
    const text = stripMention(event.text ?? "");
    await respond({ client, event, text, sayStream, setStatus, say });
  },
);

app.event(
  "message",
  async ({
    event,
    say,
    sayStream,
    setStatus,
    client,
  }: {
    event: MessageEvent;
    say: SayFn;
    sayStream: SayStreamFn;
    setStatus: SetStatusFn;
    client: WebClient;
  }) => {
    // Only handle plain DM messages: skip subtyped events (edits, deletes,
    // joins, ...), bot echoes, and channels other than a DM. Checking
    // `subtype` first narrows the union to GenericMessageEvent, the only
    // member where it's undefined.
    if (event.subtype !== undefined) return;
    if (event.channel_type !== "im" || event.bot_id) return;

    const text = stripMention(event.text ?? "");
    await respond({ client, event, text, sayStream, setStatus, say });
  },
);

app.action<BlockFeedbackButtonsAction>(
  "feedback",
  async ({ ack, payload, body, client }) => {
    await ack();
    console.log("feedback", payload.value, "for message", body.message?.ts);

    if (body.channel && body.user) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: "Thanks for the feedback.",
        thread_ts: body.message?.thread_ts ?? body.message?.ts,
      });
    }
  },
);

function productCarousel(products: ProductCard[]): CarouselBlock[] {
  if (products.length === 0) return [];
  return [
    {
      type: "carousel",
      // Slack limits: 10 cards per carousel, 200 characters per card body.
      elements: products.slice(0, 10).map((p) => ({
        type: "card",
        title: { type: "mrkdwn", text: p.title },
        subtitle: { type: "mrkdwn", text: `$${p.price}` },
        body: { type: "mrkdwn", text: p.description.slice(0, 200) },
      })),
    },
  ];
}

// Mentions arrive as "<@U0123> show me the shoes collection" - strip the
// leading mention so the model sees a plain question.
function stripMention(text: string): string {
  return text.replace(/^\s*<@[^>]+>\s*/, "").trim();
}

// Gives the agent thread memory: without a thread_ts the event is the start
// of a new thread, so its own text is the whole history. With a thread_ts,
// replay the thread from Slack so follow-ups like "refund that order" carry
// the context a fresh call to streamAnswer() would otherwise lose.
async function loadThread({
  client,
  event,
  conversationId,
  text,
}: {
  client: WebClient;
  event: { channel: string; ts: string; thread_ts?: string };
  conversationId: string;
  text: string;
}): Promise<ModelMessage[]> {
  if (!event.thread_ts) {
    return [{ role: "user", content: text }];
  }

  const { messages: replies } = await client.conversations.replies({
    channel: event.channel,
    ts: conversationId,
    limit: 50,
  });

  const history: ModelMessage[] = (replies ?? [])
    .filter((m) => m.text)
    .map((m) => ({
      role: m.bot_id ? "assistant" : "user",
      content: m.bot_id ? m.text! : stripMention(m.text!),
    }));

  const hasCurrentMessage = (replies ?? []).some((m) => m.ts === event.ts);
  if (!hasCurrentMessage) {
    history.push({ role: "user", content: text });
  }

  return history;
}

await app.start();
console.log("Slack agent connected over Socket Mode");
