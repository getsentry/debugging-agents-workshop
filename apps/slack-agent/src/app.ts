import "./instrument.ts";
import * as Sentry from "@sentry/node";
import { App } from "@slack/bolt";
import type { SayFn, SayStreamFn, SetStatusFn } from "@slack/bolt";
import type { BlockFeedbackButtonsAction } from "@slack/bolt";
import type { AppMentionEvent, KnownBlock, MessageEvent } from "@slack/types";
import type { WebClient } from "@slack/web-api";
import type { ModelMessage } from "ai";
import { streamAnswer } from "./agent.ts";
import { answerBlocks, type ToolOutcome } from "./analytics/blocks.ts";
import { TOOL_TITLES } from "./analytics/tools.ts";

const required = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "OPENROUTER_API_KEY"] as const;

for (const name of required) {
  if (!process.env[name]) {
    console.error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
    process.exit(1);
  }
}

const ERROR_REPLY = "The analytics assistant hit an error. Please try again.";

const FEEDBACK_BLOCK: KnownBlock[] = [
  {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "AI-generated. Verify important numbers before you act on them.",
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

// Analytics-flavored status lines shown while the assistant is thinking.
const LOADING_MESSAGES = [
  "Querying the warehouse...",
  "Crunching the numbers...",
  "Checking the date range...",
  "Comparing periods...",
];

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// One entry per reply in progress, so the stop button can cancel the model
// call of its own thread.
const activeRuns = new Map<string, AbortController>();

// Bolt handles every event inside one long-lived process. Without a fresh
// isolation scope and trace, each message would join the previous message's
// trace and inherit its user and conversation id.
function startMessageSpan<T>(
  options: Parameters<typeof Sentry.startSpan>[0],
  callback: () => Promise<T>,
): Promise<T> {
  return Sentry.withIsolationScope(() =>
    Sentry.startNewTrace(() => Sentry.startSpan(options, callback)),
  );
}

type ChannelType = "public" | "private" | "im";

const channelTypes = new Map<string, ChannelType>();

// Slack sends no channel_type with app_mention, so the bot asks once per
// channel. An unanswered lookup counts as private so nothing is recorded by
// mistake.
async function channelTypeOf(
  client: WebClient,
  channel: string,
): Promise<ChannelType> {
  const known = channelTypes.get(channel);
  if (known) return known;
  let type: ChannelType = "private";
  try {
    const { channel: info } = await client.conversations.info({ channel });
    type = info?.is_private ? "private" : "public";
    channelTypes.set(channel, type);
  } catch (error) {
    console.warn("conversations.info failed, treating channel as private", error);
  }
  return type;
}

async function respond({
  client,
  event,
  text,
  sayStream,
  setStatus,
  say,
  channelType,
}: {
  client: WebClient;
  event: { channel: string; ts: string; thread_ts?: string; user?: string };
  text: string;
  sayStream: SayStreamFn;
  setStatus: SetStatusFn;
  say: SayFn;
  channelType: ChannelType;
}) {
  const conversationId = event.thread_ts ?? event.ts;
  const recordContent = channelType === "public";
  let stream: ReturnType<SayStreamFn> | undefined;

  const run = new AbortController();
  const runKey = `${event.channel}:${conversationId}`;
  activeRuns.set(runKey, run);

  // One Slack message is one trace: this span is the root, so the model and
  // tool spans from the AI SDK's telemetry nest inside it.
  await startMessageSpan(
    {
      name: "slack.message",
      op: "slack.message",
      attributes: {
        "gen_ai.conversation.id": conversationId,
        "slack.channel": event.channel,
        "slack.channel_type": channelType,
        "slack.record_content": recordContent,
      },
    },
    async () => {
      // The span has its own scope, so threads that run at the same time keep
      // their own user and conversation. Sentry copies the conversation id
      // from the scope to each AI span only, and groups the thread by it.
      const scope = Sentry.getCurrentScope();
      scope.setUser(event.user ? { id: event.user } : null);
      scope.setConversationId(conversationId);

      try {
        await setStatus({
          status: "is thinking...",
          loading_messages: LOADING_MESSAGES,
        }).catch((error) => console.warn("setStatus failed", error));

        const messages = await loadThread({
          client,
          event,
          conversationId,
          text,
        });

        stream = sayStream({ task_display_mode: "timeline" });

        const taskStatus = {
          "tool-call": "in_progress",
          "tool-result": "complete",
          "tool-error": "error",
        } as const;

        const failed: string[] = [];
        const outcomes: ToolOutcome[] = [];

        for await (const part of streamAnswer({
          messages,
          conversationId,
          abortSignal: run.signal,
          recordContent,
        }).fullStream) {
          switch (part.type) {
            case "text-delta":
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
              if (part.type === "tool-result") {
                outcomes.push({
                  toolName: part.toolName,
                  input: part.input,
                  output: part.output,
                });
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

        await stream.stop({
          blocks: [...failureNotice(failed), ...answerBlocks(outcomes), ...FEEDBACK_BLOCK],
        });
      } catch (error) {
        Sentry.captureException(error);
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
    },
  );
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
    await respond({
      client,
      event,
      text,
      sayStream,
      setStatus,
      say,
      channelType: await channelTypeOf(client, event.channel),
    });
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
    await respond({
      client,
      event,
      text,
      sayStream,
      setStatus,
      say,
      channelType: "im",
    });
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

// A failed tool call gets a plain section. The model may word a failure
// softly; this line comes from the tool error itself.
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

// The title is the label of the thread in Slack's list of agent chats. Slack
// accepts it only for DM threads, so the mention handler does not call this.
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

// Mentions arrive as "<@U0123> how did signups do last week" - strip the
// leading mention so the model sees a plain question.
function stripMention(text: string): string {
  return text.replace(/^\s*<@[^>]+>\s*/, "").trim();
}

// Gives the agent thread memory: without a thread_ts the event is the start
// of a new thread, so its own text is the whole history. With a thread_ts,
// replay the thread from Slack so follow-ups like "and by device?" carry the
// context a fresh call to streamAnswer() would otherwise lose.
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
// timeline and the footer. The model copies that pattern into new replies
// when it sees it in the history, so replay only the streamed text.
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
