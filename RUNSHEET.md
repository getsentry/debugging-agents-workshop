# Presenter run sheet

One block per lab. Each block has the same five parts: outcome, prompt to
show, code to show, Sentry UI to show, takeaway. Full prompts are in
[PROMPTS.md](PROMPTS.md). Finished code is in `solutions/<lab>/instrumentation.patch`,
applied with `scripts/solution.sh <app>`. Time on the day: 55 minutes.

## Lab 0. Setup (before the day, 15 minutes, self-serve)

- **Outcome.** The storefront runs locally, its database on Neon is seeded,
  and the chat answers "What do you have in the shoes collection?" on the
  presenter's OpenRouter key. The coding agent has the Sentry plugin or MCP.
- **Prompt.** None. Show `scripts/setup.sh` and the three keys it asks for.
- **Code.** `apps/storefront/.env.example`: the variable names only.
- **Sentry UI.** None. The org exists, the projects are empty.
- **Takeaway.** Setup happens before the room. The room is for debugging.

## Lab 1. Read a trace (5 minutes, presenter)

- **Outcome.** Attendees answer three questions from one trace: how many
  model steps, which tool ran and how long its query took, and why the last
  model step has more input tokens than the first.
- **Prompt.** None.
- **Code.** `apps/storefront/app/api/chat/route.ts` on main, uninstrumented:
  `streamText`, four tools, `stopWhen: isStepCount(5)`. This is what the
  trace will explain.
- **Sentry UI.** One trace in `debugging-agents-storefront`. The 2026-09-17
  test trace has four turns, seven model calls, `getAccountInfo` and
  `refundOrder` tool spans, and `gen_ai.usage.cache_read.input_tokens`
  = 3114 on every call after the first.
- **Takeaway.** The reply is the bottom span. Debugging means reading upward.

## Lab 2. Instrument the storefront by prompt (10 minutes, hands-on)

- **Outcome.** Under one request: one `invoke_agent` span, one
  `generate_content` span per model step with model and token counts, one
  `execute_tool` span per tool call with arguments and result, `db.query`
  spans under the tool. Two turns share one conversation id.
- **Prompt.** First "Add Sentry to this app", then the full lab 2 prompt.
  The difference between the two is the lesson. Then the verify prompt:
  "Find the latest trace in the storefront project ...".
- **Code.** The solution patch, seven files. Show three:
  `instrumentation-client.ts` (replay, `setUser`), `app/api/chat/route.ts`
  (`setUser`, `setConversationId`, `captureException` in `onError`), and
  `sentry.server.config.ts` (`dsn`, `tracesSampleRate: 1`, nothing else).
  Say it out loud: no manual spans. SDK 11 traces the Vercel AI SDK by
  default and records inputs and outputs by default.
- **Sentry UI.** Traces, then the trace. Insights > AI Agents for the same
  data grouped by agent and conversation.
- **Takeaway.** Name the signals you need. Ask the agent to verify through
  Sentry, not through its own output.

## Lab 3. Debug the refund that fails (10 minutes, hands-on)

- **Outcome.** The agent finds the new issue, names the failing span and the
  cause from the trace, and applies a fix that keeps the error visible as a
  handled tool error with the order id. The rerun trace is green.
- **Prompt.** In the chat: "Show me my recent orders", then "Refund order
  1029" (1029 has no payment row; 1036 and 1042 refund fine). Then the two
  lab 3 prompts: diagnose without changing code, then apply the fix.
- **Code.** `apps/storefront/lib/db/index.ts`, `selectPayment`: the throw for
  orders that predate payments. `apps/storefront/lib/ai/tools.ts`,
  `refundOrder`: where the fix lands.
- **Sentry UI.** Issues: "Order 1029 predates the payments launch". Open the
  trace from the issue: the `execute_tool refundOrder` span is red, the
  model step after it is green, the reply apologizes. Open the replay from
  the same issue: the user saw only the apology.
- **Takeaway.** The reply the user saw is the last span. The failure was
  three levels up. Tool errors the model recovers from still deserve a
  record, because silent recovery is how agents hide failures.

## Lab 4. The same agent in Slack (10 minutes, follow-along)

- **Outcome.** One trace per Slack message: a root span with the thread
  timestamp as conversation id and the Slack user as Sentry user, the model
  call and tool spans inside. After the regression patch, cached input
  tokens on later turns drop from thousands to zero.
- **Prompt.** The lab 4 prompt (no session replay, no logs; the trace is all
  you get), then "Find the latest trace in the slack-agent project ...",
  then "Compare cached input tokens per model call between the last two
  releases".
- **Code.** `src/instrument.ts`: six lines, imported first. `src/app.ts`: the
  `Sentry.startSpan` wrapper around one message with
  `gen_ai.conversation.id` and `setUser`. Then the regression:
  `regressions/drop-prompt-cache.patch` removes one line, the
  `providerOptions` cache breakpoint on the system prompt.
- **Sentry UI.** The trace. Explore > Spans, query
  `gen_ai.usage.cache_read.input_tokens` grouped by release: one release
  shows 3114, the next shows 0.
- **Takeaway.** The prompt names the unit of work. Conversation id and user
  come from the platform. A cache regression is one attribute per release.

## Lab 5. The same agent in GitHub Actions (10 minutes, follow-along)

- **Outcome.** One trace per workflow run with the lead, two subagents, and
  the `post_review` tool, release set to the commit SHA, environment
  `github-actions`. The lead's calls read the cached prefix; the subagent
  calls read nothing. After the fan-out patch, an eight-file pull request
  runs nine subagents instead of two and costs about eight times the tokens
  of a one-file one, all of it uncached.
- **Prompt.** The lab 5 prompt (exporter, release, environment, tags,
  flush), then the verify prompt, then "Compare the last two releases:
  total input tokens, cached input tokens, and the number of subagent spans
  per run".
- **Code.** `src/sentry.ts`: `enableOpenTelemetrySetup: true`,
  `environment` and `release` from the Actions environment, the AI provider
  integrations filtered out because pi-ai depends on `openai`, and
  `beforeSendSpan` renaming `flue.tool.call.*` to `gen_ai.tool.call.*`,
  `resolveRootContext` keeping both subagents in the lead's trace, and the
  scope reset that stops the SDK transport's tracing suppression from
  leaking into Flue's later spans. `.github/workflows/review.yml`: the two
  secrets. The flush before exit.
  Then `apps/pr-reviewer/regressions/per-file-fanout.patch`, applied from
  the repository root.
- **Sentry UI.** The trace waterfall. Explore > Spans, `gen_ai.operation.name:chat`
  with the input, cache read, and cache write columns: the lead's four calls
  on `sample.diff` read 0, 1339, 2092, and 5463 cached tokens; the two
  subagent calls read 0. Then the same view grouped by release, and the pull
  request comment next to it, which looks the same for both runs. Measured
  locally on 2026-09-18: `sample.diff` is 1 trace, 6 chat spans, 2 subagents,
  about 19k input tokens; `large.diff` with the fan-out patch is 1 trace,
  17 chat spans, 12 subagents, 229k input tokens, 105k of them uncached.
- **Takeaway.** Short-lived process: ask for flush, release, environment.
  OpenTelemetry frameworks need an exporter prompt. Every fresh subagent
  conversation is uncached, so compare runs, not spans.

## Lab 6. Alerts and dashboards per critical path (10 minutes, hands-on)

- **Outcome.** Two alerts: `refundOrder` errors more than three times in
  ten minutes, and one conversation above 50,000 input tokens. One
  dashboard, "Storefront agent": tokens per day by model, and the top ten
  conversations by input tokens with their user. Checkpoint: three fast
  refund failures produce an email.
- **Prompt.** The two lab 6 prompts, alert first, dashboard second.
- **Code.** The detector and workflow payloads the agent sends (Sentry's
  workflow engine, not the legacy alert-rules API) and the dashboard JSON
  the `sentry` CLI posts. Reference dashboards live in
  `sentry-agent-tracing-examples/dashboards/`.
- **Sentry UI.** Alerts, the two new alerts and their queries. Dashboards,
  the new dashboard.
- **Takeaway.** Start from the path that costs money, not the metric the
  tool offers. Alerts and dashboards are prompts too. The attribute names
  are in the trace.
