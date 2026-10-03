# Lab 4. A different agent in Slack (10 minutes, follow-along)

10 minutes. Follow-along. The presenter drives; you can repeat it after the
workshop with `apps/slack-agent/README.md`.

`apps/slack-agent` is a Bolt app on Socket Mode. It answers direct messages
and mentions with four tools over a Postgres analytics warehouse on Neon,
seeded by `npm run db:seed`, the same database as the storefront. Each Slack
thread is one conversation. The agent sets a thread status at once, streams
its reply, and shows each tool call as a task card, and ends the reply with a
chart and a table built from the tool results. There is no browser, no
HTTP request, and no Sentry.

What changes compared with the storefront:

- The entry point is a long-running Node process, not a Next.js route.
- The conversation id is the Slack thread timestamp.
- The user is the Slack user who wrote the message.
- There is no session replay. The trace is all you get.
- A direct message is private, so the agent never records the prompt or the
  reply there. A public or private channel is visible to more than one
  person, so it does.

## Step 1. Instrument by prompt

Start your coding agent in `apps/slack-agent` and send:

> Instrument this Node.js Slack bot with Sentry. Create a new Sentry project
> for it in my organization. I need:
> - Agent tracing for the Vercel AI SDK call in `src/agent.ts`.
> - One transaction per Slack message handled in `src/app.ts`, so each
>   message shows as one trace with the model call and its tool calls inside
>   it.
> - The Slack thread timestamp set as the conversation id, and the Slack
>   user id set as the Sentry user.
> - Prompts and replies recorded only when the message is in a public or
>   private channel, never in a direct message.
> - One span per warehouse query in `src/analytics/tools.ts`, tagged with
>   the metric name, the date range length, and the row count, so a direct
>   message trace still shows something useful without the prompt and the
>   reply.
> - The release read from `SENTRY_RELEASE`, and full trace sampling for the
>   workshop.
> Use the 11.0 release of the Sentry SDK. Add only what these points need.
> The process starts with `npm run dev`. When done, start it, wait for the
> "connected over Socket Mode" line, and tell me how to confirm the first
> trace arrived.

Watch for:

- Whether it creates the transaction itself. A Node process has no incoming
  request, so nothing starts a trace for you. The agent has to wrap the
  message handler.
- Whether it imports Sentry before Bolt and the AI SDK. Import order decides
  what gets instrumented.
- Whether it ties content recording to the channel type, not to a global
  setting. A DM and a channel message go through the same code path.

## If your agent is still running

Switch to the finished result and continue:

```sh
./scripts/solution.sh slack-agent
```

Set `SENTRY_DSN` in `apps/slack-agent/.env.local`, restart `npm run dev`,
and continue with Step 2.

## Step 2. Verify

Send the bot a message in a channel it's in: "How did signups do last week
compared with the week before?" Then ask your agent:

> Find the latest trace in the slack-agent project. Show the transaction
> name, the conversation id, the user, and every gen_ai and tool span with
> its token counts.

You must see one trace for the message, with the model call and two
`analytics.scan` spans nested inside it: `compare_periods` scans the current
week and the previous week. Each `analytics.scan` span has a `db` child span
from the pg integration, for the Postgres query itself. The dev script starts
Node with `--import ./src/instrument.ts`, so Sentry loads before `pg`. A
runner that compiles TypeScript itself, such as tsx, skips that hook and
shows no db spans.

## Step 3. The same question in a channel and in a DM

Ask the exact same question two ways: once as a mention in a public or
private channel, and once as a direct message to the bot. Open both traces
and compare them.

The channel trace shows the prompt, the reply, and the arguments each tool
call received. The DM trace shows none of that. It still shows two
`analytics.scan` spans, each with the metric name, the date range length,
the row count, and the model call's token counts and cached tokens.

Ask your agent:

> Compare the channel trace and the DM trace for this question. What shows
> up in one and not the other, and why?

## Step 4. Ship the regression

The regression ships the way regressions ship: as a merged pull request. The
presenter merges the branch `lab4-drop-prompt-cache` into `main`, tags a
release from the new `main` commit, restarts the bot on it, and sends three
more messages in the same thread. Working alone, apply
`apps/slack-agent/regressions/drop-prompt-cache.patch` instead and tag a
release from your own commit.

Ask:

> Compare cached input tokens per model call between the last two releases of
> the slack-agent project.

Before the regression, the second and later turns in a thread show cached
input tokens. After it, they show zero, because the change removes the cache
breakpoint on the system prompt: Anthropic no longer has anything to match
against. The cost per conversation rises several times. This is the
regression from the talk, now in your own project.

## Step 5. What picks the issue up

The monitor "Cache misses on model calls" counts model calls that read zero
cached tokens and opens an issue when it sees more than two in ten minutes.
Nothing threw. A number crossed a line, and the issue links the traces that
prove it. From here, four kinds of automation can take over. Each one reads
the trace first.

- Seer Autofix. Built into Sentry, enabled per project. It runs on issues
  with 10 or more events in 14 days and stops at root cause, plan, or a
  drafted pull request, or hands off to Claude Code or Cursor. It never
  merges. https://sentry.io/cookbook/self-healing-workflow-seer/
- Cursor automation. A native Sentry trigger (issue created, updated, or any
  event) filtered by project and environment, with the Sentry MCP and Open
  Pull Request as tools. One pull request, and a human merges.
  https://sentry.io/cookbook/regressed-issue-to-pr-cursor/
- Claude Routine. A saved Claude Code run in the cloud, started by a
  schedule, an HTTP call, or a GitHub event. Point a Sentry webhook at its
  URL and give it the Sentry MCP as a connector.
  https://sentry.io/cookbook/automate-ai-agent-triage-claude-routines/
- Seer in Slack. The alert posts to a channel. Reply `@sentry` in its thread
  and the Seer agent answers with the issue, the trace, and the replay. The
  same notification can start Autofix.
  https://sentry.io/cookbook/fix-sentry-issues-from-slack/

Lab 6 ends on the same list.

## What you learned

- The prompt names the unit of work. In Slack it is one message, so the
  prompt asks for one transaction per message.
- Conversation id and user come from the platform. Tell the agent where they
  are.
- Content recording can follow a rule the platform already gives you, such
  as channel type, instead of an all-or-nothing switch.
- A span's attributes can stay useful on their own, even when its inputs and
  outputs are never recorded.
- A cache regression shows up as a change in one attribute per release. It
  is invisible without agent tracing.

## Reference: an earlier version of this bot on eve

The reference repo has an earlier version of this assistant, the one that
shared the storefront's product catalog and orders, on Vercel's eve
framework, in `slack-agent-eve` (Sentry SDK inside eve's OpenTelemetry
pipeline) and `slack-agent-eve-otel` (OTLP export to Sentry). eve is
webhook-based and needs a Vercel deploy, so the lab uses Bolt. Read those two
when your own agent framework owns the trace pipeline.
