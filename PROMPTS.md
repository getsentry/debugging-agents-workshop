# Prompts

The prompts that instrumented the three apps, verified the traces, debugged
the planted bug, and created the dashboards and monitors. Paste them into a
coding agent that has Sentry's MCP server attached (see the README). Run each
one from the app's folder. The agent creates the Sentry project, edits the
code, and checks the result in Sentry.

## Instrument

### Storefront (`apps/storefront`)

```
Instrument this Next.js app with Sentry. Create a new Sentry project for it
in my organization. I need:
- Agent tracing for the Vercel AI SDK calls in `app/api/chat/route.ts`,
  with inputs and outputs recorded, so I can read the prompt, the tool
  calls, the tool results, and the token usage per step.
- The conversation id from the chat request body set on every span in the
  request, and the demo user from `lib/demo-user.ts` set as the Sentry user
  on the server and in the browser, so traces, errors, and replays all
  carry it.
- Database spans for the Postgres queries in `lib/db`.
- Session replay in the browser, so a failed chat turn links to what the
  user saw. Record the page as the shopper saw it, but mask their name and
  email.
- Full trace sampling.
Use version 11 of the Sentry SDK. Add only what these points need; no edge
runtime config, no extra error boundaries. When done, start the dev server,
send one chat message that searches the apparel collection, then query
Sentry for the resulting trace and show me the gen_ai spans with their token
counts.
```

### Slack agent (`apps/slack-agent`)

```
Instrument this Node.js Slack bot with Sentry. Create a new Sentry project
for it in my organization. I need:
- Agent tracing for the Vercel AI SDK call in `src/agent.ts`.
- One transaction per Slack message handled in `src/app.ts`, so each
  message shows as one trace with the model call and its tool calls inside
  it.
- The Slack thread timestamp set as the conversation id, and the Slack
  user id set as the Sentry user.
- Prompts and replies recorded only when the message is in a public
  channel, never in a private channel or a direct message. Ask Slack once
  per channel whether it is private, and record nothing if that lookup
  fails.
- One span per warehouse query in `src/analytics/tools.ts`, tagged with
  the metric name, the date range length, and the row count, so a private
  trace still shows something useful without the prompt and the reply.
- The release read from `SENTRY_RELEASE`, and full trace sampling.
Use version 11 of the Sentry SDK. Add only what these points need. The
process starts with `npm run dev`. When done, start it, wait for the
"connected over Socket Mode" line, and tell me how to confirm the first
trace arrived.
```

### PR reviewer (`apps/pr-reviewer`)

```
Instrument this Flue agent with Sentry so every GitHub Actions run produces
one trace. Create a new Sentry project for it in my organization. I need:
- Flue's OpenTelemetry spans exported to Sentry, so the lead, both
  subagents, and the tools show as nested gen_ai spans with token counts.
- The release set to the commit SHA and the environment set to
  `github-actions`, with `local` when I run `npm run demo` on my machine.
- The repository and pull request number as tags on every span.
- A flush before the process exits, so the last spans are not lost.
- Full trace sampling.
Use version 11 of the Sentry SDK. Add only what these points need.
Add the `SENTRY_DSN` secret to `.github/workflows/review.yml`. Then run
`npm run demo` against `fixtures/sample.diff` and show me the resulting
trace.
```

## Verify

```
Find the latest trace in the storefront project. List every span with its
op, its duration, and for gen_ai spans the model, input tokens, and output
tokens. Which tool ran, and what did it return?
```

```
Find the latest trace in the slack-agent project. Show the transaction
name, the conversation id, the user, and every gen_ai and tool span with
its token counts.
```

```
Find the latest trace in the pr-reviewer project. Show the lead span, the
two subagent spans, and the total input tokens for the run.
```

## Debug

The storefront has a planted bug: `refundOrder` throws for orders placed
before June 2026, because those orders have no row in the `payments` table.
In the chat, ask "Refund order 1029" to hit it, then:

```
There is a new issue in the storefront Sentry project from a failed refund
in the chat. Find it, pull the full context including the trace and the
replay, tell me which span failed and why, and propose a fix. Do not change
code yet.
```

```
Apply the first fix in `lib/ai/tools.ts`. Keep the error visible in Sentry
as a handled tool error with the order id as an attribute. Then rerun the
refund in the chat and show me the new trace.
```

For the Slack agent, cached input tokens tell you whether prompt caching
works. The system prompt and the tools carry a cache breakpoint in
`src/agent.ts`; remove it and every turn pays full price:

```
Compare cached input tokens per model call between the last two releases of
the slack-agent project.
```

For the PR reviewer, a long `run_tests` call can outlive Anthropic's
five-minute prompt cache:

```
Show the chat spans of the latest pr-reviewer run with input tokens, cached
input tokens, and start time. Which call read nothing from the cache, and
what ran right before it?
```

## Dashboards

`scripts/dashboards/` creates the finished dashboards. To build one by
prompt instead:

```
Create a dashboard called "Slack bot: who asks, what it costs" in my org for
the slack-agent project. Top row, one big number each: total model spend in
USD (sum of gen_ai.cost.total_tokens on ai_client spans), questions answered
(count of slack.message spans), people asking (unique user.id), and cache hit
rate as a percentage (cache_read input tokens over input tokens). Below it: a
table of the top users by spend with their model calls and conversations, a
table of the most expensive conversations, and a line chart of cache hit rate
by release. Scope every widget to the project with a project.id filter and
leave the dashboard on all projects. Then open it.
```

Or ask Seer in the Dashboards page, in one sentence: "Top users by model
spend for the Slack bot, and spend over time by release."

## Monitors

`scripts/alerts/` creates the finished monitors. To build one by prompt
instead:

```
In the slack-agent Sentry project, create a metric monitor that opens an
issue when more than 2 model calls in 10 minutes read nothing from the
prompt cache (gen_ai.usage.cache_read.input_tokens is 0 on
gen_ai.generate_content spans). Connect it to an alert that emails me and
posts to the #sentry-alerts Slack channel with a note that mentions @Sentry,
so Seer investigates as soon as it posts. Look at an existing detector in
the org for the payload shape first. Show me the monitor and the query it
uses.
```

When it fires:

```
The cache-miss monitor fired. Open the issue it points to, tell me how many
model calls hit it and in which release, get Seer's root cause, and propose
the fix.
```
