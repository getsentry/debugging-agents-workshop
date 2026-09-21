import { App } from "@slack/bolt";
import type { SayFn, SayStreamFn, SetStatusFn } from "@slack/bolt";
import type { BlockFeedbackButtonsAction } from "@slack/bolt";
import type { BlockButtonAction } from "@slack/bolt";
import type {
  AppMentionEvent,
  CarouselBlock,
  KnownBlock,
  MessageEvent,
  TableBlock,
} from "@slack/types";
import type { WebClient } from "@slack/web-api";
import type { ModelMessage } from "ai";
import type { AccountInfo, ProductCard } from "lib/ai/tools";
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

// One entry per reply in progress, so the stop button can cancel the model
// call of its own thread.
const activeRuns = new Map<string, AbortController>();

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

  const run = new AbortController();
  const runKey = `${event.channel}:${conversationId}`;
  activeRuns.set(runKey, run);

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
    let orders: AccountInfo["orders"] = [];
    const failed: string[] = [];

    for await (const part of streamAnswer({
      messages,
      conversationId,
      abortSignal: run.signal,
    }).fullStream) {
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
            } else if (part.toolName === "getAccountInfo") {
              orders = part.output.orders;
            }
          }
          if (part.type === "tool-error") {
            failed.push(TOOL_TITLES[part.toolName] ?? part.toolName);
          }
          break;
        case "abort":
          // The user pressed stop. Slack has already closed the streamed
          // message, so there is nothing left to stop or decorate.
          return;
        case "error":
          throw part.error;
        default:
          break;
      }
    }

    // A search returns up to six products and the model often picks a few
    // (for example "under $60"), so show only the ones the reply names.
    const products = [...found.values()].filter((p) => reply.includes(p.title));
    const named = orders.filter((o) => reply.includes(o.id));
    await stream.stop({
      blocks: [
        ...failureNotice(failed),
        ...productCarousel(products),
        ...ordersTable(named),
        ...FEEDBACK_BLOCK,
      ],
    });
  } catch (error) {
    if (stream) {
      await stream.stop({ markdown_text: ERROR_REPLY });
    } else {
      await say({ text: ERROR_REPLY, thread_ts: conversationId });
    }
    throw error;
  } finally {
    activeRuns.delete(runKey);
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
    await titleThread(client, event, text);
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
    await titleThread(client, event, text);
    await respond({ client, event, text, sayStream, setStatus, say });
  },
);

// Slack sends this when the user presses the stop button. Slack shows that
// button only to apps that subscribe to the event.
app.event("agent_session_stopped", async ({ event }) => {
  const { channel, thread_ts } = event as unknown as {
    channel: string;
    thread_ts: string;
  };
  activeRuns.get(`${channel}:${thread_ts}`)?.abort();
});

// A click on a product card's button is a new turn in the same thread.
app.action<BlockButtonAction>(
  "product_details",
  async ({ ack, action, body, client, context, say }) => {
    await ack();
    const channel = body.channel?.id;
    const thread_ts = body.message?.thread_ts ?? body.message?.ts;
    if (!channel || !thread_ts || !action.value) return;

    // Bolt gives sayStream and setStatus to event listeners only.
    const sayStream: SayStreamFn = (args) =>
      client.chatStream({
        channel,
        thread_ts,
        recipient_team_id: context.teamId ?? context.enterpriseId,
        recipient_user_id: body.user.id,
        ...args,
      });
    const setStatus: SetStatusFn = (status) =>
      client.assistant.threads.setStatus({
        channel_id: channel,
        thread_ts,
        ...(typeof status === "string" ? { status } : status),
      });

    await respond({
      client,
      event: { channel, ts: action.action_ts, thread_ts, user: body.user.id },
      text: `Tell me more about the ${action.value}.`,
      sayStream,
      setStatus,
      say,
    });
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

// Slack loads card images over the public internet, and the storefront runs
// only on localhost, so the cards read the same files from GitHub.
const PRODUCT_IMAGE_BASE =
  "https://raw.githubusercontent.com/getsentry/debugging-agents-workshop/main/apps/storefront/public";

function productCarousel(products: ProductCard[]): CarouselBlock[] {
  if (products.length === 0) return [];
  return [
    {
      type: "carousel",
      // Slack limits: 10 cards per carousel, 200 characters per card body.
      elements: products.slice(0, 10).map((p) => ({
        type: "card",
        hero_image: {
          type: "image",
          image_url: `${PRODUCT_IMAGE_BASE}${p.image}`,
          alt_text: p.title,
        },
        title: { type: "mrkdwn", text: p.title },
        subtitle: { type: "mrkdwn", text: `$${p.price}` },
        body: { type: "mrkdwn", text: p.description.slice(0, 200) },
        actions: [
          {
            type: "button",
            action_id: "product_details",
            text: { type: "plain_text", text: "Tell me more" },
            value: p.title,
          },
        ],
      })),
    },
  ];
}

function ordersTable(orders: AccountInfo["orders"]): TableBlock[] {
  if (orders.length === 0) return [];
  const row = (...cells: string[]) =>
    cells.map((text) => ({ type: "raw_text" as const, text }));
  return [
    {
      type: "table",
      column_settings: [{}, {}, { align: "right" }],
      rows: [
        row("Order", "Status", "Total"),
        ...orders.map((o) => row(o.id, o.status, `$${o.total}`)),
      ],
    },
  ];
}

// Slack accepts its red "alert" block only in modals, so a failed tool gets a
// plain section. The model may word a failure softly; this line comes from
// the tool error itself.
function failureNotice(failed: string[]): KnownBlock[] {
  if (failed.length === 0) return [];
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⚠️ *Failed:* ${failed.join(", ")}. The team has been notified.`,
      },
    },
  ];
}

// The title is the label of the thread in Slack's list of agent chats.
async function titleThread(
  client: WebClient,
  event: { channel: string; ts: string; thread_ts?: string },
  text: string,
) {
  if (event.thread_ts || !text) return;
  await client.assistant.threads
    .setTitle({ channel_id: event.channel, thread_ts: event.ts, title: text })
    .catch((error) => console.warn("setTitle failed", error));
}

// Mentions arrive as "<@U0123> show me the apparel collection" - strip the
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
      content: m.bot_id ? replyText(m) : stripMention(m.text!),
    }));

  const hasCurrentMessage = (replies ?? []).some((m) => m.ts === event.ts);
  if (!hasCurrentMessage) {
    history.push({ role: "user", content: text });
  }

  return history;
}

// A bot message's `text` also holds Slack's plain-text fallback for the task
// timeline, the cards, and the footer. The model copies that pattern into new
// replies when it sees it in the history, so replay only the streamed text.
function replyText(message: { text?: string; blocks?: unknown[] }): string {
  const flatten = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const { type, text, elements } = node as {
      type?: string;
      text?: unknown;
      elements?: unknown[];
    };
    if (typeof text === "string") return text;
    const separator =
      type === "rich_text" || type === "rich_text_list" ? "\n" : "";
    return (elements ?? []).map(flatten).join(separator);
  };

  const streamed = (message.blocks ?? [])
    .filter((b) => (b as { type?: string }).type === "rich_text")
    .map(flatten)
    .join("\n");
  return streamed || message.text!;
}

await app.start();
console.log("Slack agent connected over Socket Mode");
