import { App } from "@slack/bolt";
import type { SayFn } from "@slack/bolt";
import type { AppMentionEvent, MessageEvent } from "@slack/types";
import type { WebClient } from "@slack/web-api";
import type { ModelMessage } from "ai";
import { answer } from "./agent";

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

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const ERROR_REPLY = "The shopping assistant hit an error. Please try again.";

app.event(
  "app_mention",
  async ({
    event,
    say,
    client,
  }: {
    event: AppMentionEvent;
    say: SayFn;
    client: WebClient;
  }) => {
    const conversationId = event.thread_ts ?? event.ts;
    const text = stripMention(event.text ?? "");

    try {
      const messages = await loadThread({ client, event, conversationId, text });
      const reply = await answer({ messages, conversationId });
      await say({ text: reply, thread_ts: conversationId });
    } catch (error) {
      await say({ text: ERROR_REPLY, thread_ts: conversationId });
      throw error;
    }
  },
);

app.event(
  "message",
  async ({
    event,
    say,
    client,
  }: {
    event: MessageEvent;
    say: SayFn;
    client: WebClient;
  }) => {
    // Only handle plain DM messages: skip subtyped events (edits, deletes,
    // joins, ...), bot echoes, and channels other than a DM. Checking
    // `subtype` first narrows the union to GenericMessageEvent, the only
    // member where it's undefined.
    if (event.subtype !== undefined) return;
    if (event.channel_type !== "im" || event.bot_id) return;

    const conversationId = event.thread_ts ?? event.ts;
    const text = stripMention(event.text ?? "");

    try {
      const messages = await loadThread({ client, event, conversationId, text });
      const reply = await answer({ messages, conversationId });
      await say({ text: reply, thread_ts: conversationId });
    } catch (error) {
      await say({ text: ERROR_REPLY, thread_ts: conversationId });
      throw error;
    }
  },
);

// Mentions arrive as "<@U0123> show me the shoes collection" - strip the
// leading mention so the model sees a plain question.
function stripMention(text: string): string {
  return text.replace(/^\s*<@[^>]+>\s*/, "").trim();
}

// Gives the agent thread memory: without a thread_ts the event is the start
// of a new thread, so its own text is the whole history. With a thread_ts,
// replay the thread from Slack so follow-ups like "refund that order" carry
// the context a fresh call to answer() would otherwise lose.
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
