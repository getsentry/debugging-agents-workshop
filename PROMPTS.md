# Prompt sheet

Every prompt from the labs, in order, ready to paste. Start your coding agent in
the directory named above each prompt. Agents take different paths and different
amounts of time. When yours is still running and the room moves on, apply the
finished result with `./scripts/solution.sh <app>` and continue from the next
prompt. See `solutions/` for what each result contains.

## Lab 2. Instrument the storefront

Directory: `apps/storefront`. Full lab: [labs/02-instrument-storefront.md](labs/02-instrument-storefront.md).

### Step 1. The weak prompt

```text
Add Sentry to this app.
```

### Step 2. The prompt that describes the outcome

```text
Instrument this Next.js app with Sentry. Create a new Sentry project for it
in my organization. I need:
- Agent tracing for the Vercel AI SDK calls in `app/api/chat/route.ts`,
with inputs and outputs recorded, so I can read the prompt, the tool
calls, the tool results, and the token usage per step.
- The conversation id from the chat request body set on every span in the
request, and the demo user from `lib/demo-user.ts` set as the Sentry user
on the server and in the browser, so traces, errors, and replays all carry
it.
- Database spans for the Postgres queries in `lib/db`.
- Session replay in the browser, so a failed chat turn links to what the
user saw.
- Full trace sampling for the workshop.
Use the 11.0 release candidate of the Sentry SDK, npm tag `next`. Add only
what these points need; no edge runtime config, no extra error boundaries.
When done, start the dev server, send one chat message that searches the
shoes collection, then query Sentry for the resulting trace and show me the
gen_ai spans with their token counts.
```

### Step 3. Verify

```text
Find the latest trace in the storefront project. List every span with its
op, its duration, and for gen_ai spans the model, input tokens, and output
tokens. Which tool ran, and what did it return?
```

### Checkpoint

```text
Show me all traces for conversation id `<id>` in the storefront project.
```

## Lab 3. Debug the refund

Directory: `apps/storefront`. Full lab: [labs/03-debug-refund.md](labs/03-debug-refund.md).

### Step 2. Let the agent find it

```text
There is a new issue in the storefront Sentry project from a failed refund
in the chat. Find it, pull the full context including the trace and the
replay, tell me which span failed and why, and propose a fix. Do not change
code yet.
```

### Step 3. Decide the fix, then apply it

```text
Apply the first fix in `lib/ai/tools.ts`. Keep the error visible in Sentry
as a handled tool error with the order id as an attribute. Then rerun the
refund in the chat and show me the new trace.
```

## Lab 4. Slack agent

Directory: `apps/slack-agent`. Full lab: [labs/04-slack-agent.md](labs/04-slack-agent.md).

### Step 1. Instrument by prompt

```text
Instrument this Node.js Slack bot with Sentry. Create a new Sentry project
for it in my organization. I need:
- Agent tracing for the Vercel AI SDK call in `src/agent.ts`, with inputs
and outputs recorded.
- One transaction per Slack message handled in `src/app.ts`, so each
message shows as one trace with the model calls and tool calls inside it.
- The Slack thread timestamp set as the conversation id, and the Slack
user id set as the Sentry user.
- Database spans for the Postgres queries under `../storefront/lib/db`.
- Full trace sampling for the workshop.
Use the 11.0 release candidate of the Sentry SDK, npm tag `next`. Add only
what these points need.
The process starts with `npm run dev`. When done, start it, wait for the
"connected over Socket Mode" line, and tell me how to confirm the first
trace arrived.
```

### Step 2. Verify

```text
Find the latest trace in the slack-agent project. Show the transaction
name, the conversation id, the user, and every gen_ai and tool span with
its token counts.
```

### Step 3. Ship the regression

```text
Compare cached input tokens per model call between the last two releases of
the slack-agent project.
```

## Lab 5. PR reviewer

Directory: `apps/pr-reviewer`. Full lab: [labs/05-pr-reviewer.md](labs/05-pr-reviewer.md).

### Step 1. Instrument by prompt

```text
Instrument this Flue agent with Sentry so every GitHub Actions run produces
one trace. Create a new Sentry project for it in my organization. I need:
- Flue's OpenTelemetry spans exported to Sentry, so the lead, both
subagents, and the tools show as nested gen_ai spans with token counts.
- The release set to the commit SHA and the environment set to
`github-actions`, with `local` when I run `npm run demo` on my machine.
- The repository and pull request number as tags on every span.
- A flush before the process exits, so the last spans are not lost.
- Full trace sampling.
Use the 11.0 release candidate of the Sentry SDK, npm tag `next`. Add only
what these points need.
Add the `SENTRY_DSN` secret to `.github/workflows/review.yml`. Then run
`npm run demo` against `fixtures/sample.diff` and show me the resulting
trace.
```

### Step 2. Verify

```text
Find the latest trace in the pr-reviewer project. Show the lead span, the
two subagent spans, and the total input tokens for the run.
```

### Step 3. Ship the regression

```text
Compare the last two releases of the pr-reviewer project: total input
tokens, cached input tokens, and the number of subagent spans per run.
```

## Lab 6. Alerts and dashboards

Directory: `apps/storefront`. Full lab: [labs/06-critical-paths.md](labs/06-critical-paths.md).

### Step 2. One alert by prompt

```text
In the storefront Sentry project, create an alert that fires when the
`refundOrder` tool errors more than 3 times in 10 minutes, and another
that fires when a single conversation uses more than 50,000 input tokens.
Notify by email. Show me both alerts and the query each one uses.
```

### Step 3. One dashboard by CLI

```text
Use the sentry CLI to create a dashboard called "Storefront agent" in my
org with two widgets: total input and output tokens per day grouped by
`gen_ai.request.model`, and a table of the top 10 conversations by input
tokens with their user. Then open it.
```

