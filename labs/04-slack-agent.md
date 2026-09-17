# Lab 4. The same agent in Slack

10 minutes. Follow-along. The presenter drives; you can repeat it after the
workshop with `apps/slack-agent/README.md`.

`apps/slack-agent` is a Bolt app on Socket Mode. It answers direct messages
and mentions with the storefront's four tools and the same Postgres database.
Each Slack thread is one conversation. There is no browser, no HTTP request,
and no Sentry.

What changes compared with the storefront:

- The entry point is a long-running Node process, not a Next.js route.
- The conversation id is the Slack thread timestamp.
- The user is the Slack user who wrote the message.
- There is no session replay. The trace and the logs are all you get.

## Step 1. Instrument by prompt

Start your coding agent in `apps/slack-agent` and send:

> Instrument this Node.js Slack bot with Sentry. Create a new Sentry project
> for it in my organization. I need:
> - Agent tracing for the Vercel AI SDK call in `src/agent.ts`, with inputs
>   and outputs recorded.
> - One transaction per Slack message handled in `src/app.ts`, so each
>   message shows as one trace with the model calls and tool calls inside it.
> - The Slack thread timestamp set as the conversation id, and the Slack
>   user id set as the Sentry user.
> - Database spans for the Postgres queries under `../storefront/lib/db`.
> - Logs sent to Sentry for the bot's own log lines.
> - Full trace sampling for the workshop.
> Use the 11.0 release candidate of the Sentry SDK, npm tag `next`. Add only
> what these points need.
> The process starts with `npm run dev`. When done, start it, wait for the
> "connected over Socket Mode" line, and tell me how to confirm the first
> trace arrived.

Watch for:

- Whether it creates the transaction itself. A Node process has no incoming
  request, so nothing starts a trace for you. The agent has to wrap the
  message handler.
- Whether it imports Sentry before Bolt and the AI SDK. Import order decides
  what gets instrumented.

## If your agent is still running

Switch to the finished result and continue:

```sh
./scripts/solution.sh slack-agent
```

Set `SENTRY_DSN` in `apps/slack-agent/.env.local`, restart `npm run dev`,
and continue with Step 2.

## Step 2. Verify

Send the bot a direct message: "what did I order last?" Then ask your agent:

> Find the latest trace in the slack-agent project. Show the transaction
> name, the conversation id, the user, and every gen_ai and tool span with
> its token counts.

You must see one trace for the message with the model call and the
`getAccountInfo` tool span nested inside it.

## Step 3. Ship the regression

The presenter tags a release and applies
`apps/slack-agent/regressions/drop-prompt-cache.patch`, then restarts the bot
and sends three more messages in the same thread.

Ask:

> Compare cached input tokens per model call between the last two releases of
> the slack-agent project.

Before the patch, the second and later turns in a thread show cached input
tokens. After it, they show zero, because the patch removes the cache
breakpoint on the system prompt: Anthropic no longer has anything to match
against. The cost per conversation rises several times. This is the
regression from the talk, now in your own project.

## What you learned

- The prompt names the unit of work. In Slack it is one message, so the
  prompt asks for one transaction per message.
- Conversation id and user come from the platform. Tell the agent where they
  are.
- A cache regression shows up as a change in one attribute per release. It
  is invisible without agent tracing.

## Reference: the same bot on eve

The reference repo has this assistant on Vercel's eve framework, in
`slack-agent-eve` (Sentry SDK inside eve's OpenTelemetry pipeline) and
`slack-agent-eve-otel` (OTLP export to Sentry). eve is webhook-based and
needs a Vercel deploy, so the lab uses Bolt. Read those two when your own
agent framework owns the trace pipeline.
