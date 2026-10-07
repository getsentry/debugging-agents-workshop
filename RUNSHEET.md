# Presenter run sheet

One block per lab. Each block has the same five parts: outcome, prompt to
show, code to show, Sentry UI to show, takeaway. Full prompts are in the
lab files. Finished code is in `solutions/<lab>/instrumentation.patch`,
applied with `scripts/solution.sh <app>`. Time on the day: 55 minutes.

## Lab 0. Setup (before the day, 15 minutes, self-serve)

- **Outcome.** The storefront runs locally, its database on Neon is seeded,
  and the chat answers "What do you have in the apparel collection?" on the
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
  handled tool error with the order id. The rerun trace is green. Then it
  triages the issue: assigned, Seer analysis compared, resolved with the fix
  commit.
- **Mechanism.** Say the names out loud once. MCP: `search_issues`,
  `get_trace_details`, `get_sentry_resource` for the replay,
  `analyze_issue_with_seer`, `update_issue`; the `sentry-debug-issue` skill
  is the script the agent follows. CLI: `sentry issue list`, `view --spans
  all`, `explain`, `resolve`. Seer refuses a project with no connected
  repository, so link the fork first or skip the Seer comparison. Debugging
  is tool calls, and tool calls run from any agent and from CI.
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

## Lab 4. A different agent in Slack (10 minutes, follow-along)

- **Outcome.** One trace per Slack message: a root span with the thread
  timestamp as conversation id and the Slack user as Sentry user, the model
  call and its `analytics.scan` tool spans inside, each with a `db` child
  span for the Postgres query. A channel message records the prompt and the
  reply; a direct message never does, but its scan spans still carry the
  metric, the range length, and the row count. After the regression patch,
  cached input tokens on later turns drop from thousands to zero.
- **Prompt.** The lab 4 instrument prompt (one transaction per message,
  content recorded only outside direct messages, one span per warehouse
  scan), then "Find the latest trace in the slack-agent project ...", then
  the same question asked in a channel and in a DM, then "Compare cached
  input tokens per model call between the last two releases".
- **Code.** `src/instrument.ts`: Sentry init plus the `dataCollection` block
  that turns content recording off by default. `src/app.ts`: the
  `Sentry.startSpan` wrapper around one message with
  `gen_ai.conversation.id`, `setUser`, and the `slack.record_content`
  attribute. `src/agent.ts`: the per-call `telemetry` override that follows
  the same channel-vs-DM rule. `src/analytics/tools.ts`: one
  `Sentry.startSpan` per warehouse scan. Then the regression:
  `regressions/drop-prompt-cache.patch` removes one line, the
  `providerOptions` cache breakpoint on the system prompt.
- **Sentry UI.** The channel trace next to the DM trace for the same
  question: one shows the prompt, the reply, and the tool arguments; the
  other shows only the scan spans' attributes and their `db` child spans.
  Then Explore > Spans, query
  `gen_ai.usage.cache_read.input_tokens` grouped by release: one release
  shows 3114, the next shows 0.
- **Takeaway.** The prompt names the unit of work. Conversation id and user
  come from the platform. Content recording can follow a rule the platform
  already gives you, such as channel type. A cache regression is one
  attribute per release.

## Lab 5. The same agent in GitHub Actions (10 minutes, follow-along)

- **Outcome.** One trace per workflow run with the lead, two subagents, the
  `run_tests` tool, and the `post_review` tool, release set to the commit
  SHA, environment `github-actions`. On a pull request that touches
  `fixtures/demo-pr/cart-total.ts`, `run_tests` runs the integration fixture
  for about eight minutes, the five-minute prompt cache expires, and the
  verdict call reads zero cached tokens. With `PI_CACHE_RETENTION: long` in
  the workflow, the same pull request reads the cache on every call.
- **Prompt.** The lab 5 prompt (exporter, release, environment, tags,
  flush), then the verify prompt, then "Show the chat spans of the latest
  run with input tokens, cached input tokens, and start time. Which call
  read nothing from the cache, and what ran right before it?"
- **Code.** `src/sentry.ts`: `enableOpenTelemetrySetup: true`,
  `environment` and `release` from the Actions environment, the AI provider
  integrations filtered out because pi-ai depends on `openai`,
  `beforeSendSpan` renaming `flue.tool.call.*` to `gen_ai.tool.call.*` and
  Flue's cache-read and cache-write counts to Sentry's
  `gen_ai.usage.input_tokens.cached` and `.cache_write`,
  `resolveRootContext` keeping both subagents in the lead's trace, and the
  scope reset that stops the SDK transport's tracing suppression from
  leaking into Flue's later spans. `.github/workflows/review.yml`: the two
  secrets, then the one-line fix. `src/agents/review.ts`: `run_tests` runs
  `vitest related` on the changed files inside `fixtures/demo-pr`.
  `fixtures/demo-pr/checkout-flow.integration.test.ts`: six tests, 80
  seconds each, on purpose.
- **Sentry UI.** The trace waterfall with the long `run_tests` span. Explore
  > Spans, `gen_ai.operation.name:chat` with the input, cached, and cache
  write columns, sorted by start time. Then the same pull request after the
  fix. Numbers: to measure on the rerun before the workshop.
- **Takeaway.** Short-lived process: ask for flush, release, environment.
  OpenTelemetry frameworks need an exporter prompt. A prompt cache has a
  lifetime; a tool call that outlives it makes the next call pay full price.

## Lab 6. Alerts and dashboards per critical path (10 minutes, hands-on)

- **Outcome.** Two alerts: `refundOrder` errors more than three times in
  ten minutes, and model call failure rate above 10% over five minutes.
  One dashboard, "Storefront agent": tokens per day by model, and the top
  ten conversations by input tokens with their user. Checkpoint: three
  fast refund failures produce an email. The presenter's copies, built
  2026-09-18 in `debugging-agents-storefront`: workflow 5369309, detectors
  10374603 (refund), 10374604 (failure rate), 10374605 (slow turns, p95 >
  15 s), 10374606 (input tokens per hour, anomaly), dashboard 10117079 ("Storefront agent: critical paths", from `scripts/dashboards/agent-critical-paths.mjs`). Every detector was
  accepted on the first POST once the payload copied an existing one.
- **Prompt.** The two lab 6 prompts, alert first, dashboard second. While
  the room waits for the alert email, the Step 5 triage prompt on the issue
  the alert opened.
- **Mechanism.** Alerts: the `sentry-create-alert` skill over the workflow
  engine API; `sentry alert metrics list` shows the result. Dashboard:
  `sentry dashboard create`. Triage: the lab 3 MCP tools again, started by
  an alert. Name the automated version: a webhook action on the workflow, or
  a scheduled agent over `sentry issue list --query "is:unresolved
  firstSeen:-1h"`.
- **Code.** The detector and workflow payloads the agent sends (Sentry's
  workflow engine, not the legacy alert-rules API) and the dashboard JSON
  the `sentry` CLI posts. Reference dashboards live in
  `sentry-agent-tracing-examples/dashboards/`.
- **Sentry UI.** Alerts, the two new alerts and their queries. Dashboards,
  the new dashboard. Say why there is no per-conversation alert: the
  detector API refuses `groupBy` ("Group by Metric Alerts feature must be
  enabled"), so the top-ten table is the answer.
- **Pitfall.** A 403 from the CLI is almost always the account, not the
  scopes. The `sentry auth login` default scope set covers every lab
  (`event:write` for Seer, `alerts:write` for the detectors, `org:read` for
  dashboards). Check `sentry auth status`. A 403 on every command means the
  CLI is logged in as an account that is not a member of the org. Do not
  pass `--scope` to `sentry auth refresh` to fix it. That flag replaces the
  whole scope set with what you pass.
- **Takeaway.** Start from the path that costs money, not the metric the
  tool offers. Alerts and dashboards are prompts too. The attribute names
  are in the trace.
