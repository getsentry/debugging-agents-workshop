# slack-agent

A Slack bot that answers product analytics questions in a DM or when
mentioned. It reads from `analytics_daily`, a Postgres table on Neon with
ninety days of history, seeded from a deterministic generator in
`src/analytics/generate.ts`. It reads the whole thread on every message, so
follow-ups like "and by device?" work.

## What it can answer

Four tools back every answer:

- `list_metrics` - the metric catalog: `signups`, `active_users`,
  `page_views`, `checkout_conversion`, `error_rate`, each with its unit and
  the dimensions it can be grouped by.
- `query_metric` - one metric over a date range, with an optional
  `groupBy` for a per-dimension breakdown.
- `compare_periods` - one metric's total in a current range against a
  previous range, with the absolute and percent change.
- `top_movers` - which values of a dimension moved the most between the
  first and second half of a date range.

The system prompt tells the assistant to call a tool before stating any
number, name the metric and the exact date range it used, and compare
against the previous period of the same length when asked how something
"did".

## Data collection

The assistant records its prompts and replies only when the message came
from a public channel - never from a private channel or a direct message. It
asks Slack once per channel whether the channel is private, and if that lookup
fails it records nothing. A private channel or DM still produces a trace: the root `slack.message` span and, for every warehouse
query, an `analytics.scan` span with the metric name, the range length, and
the row count, with a `db` span inside it for the Postgres query, none of
which need the prompt or the reply to be useful.

## Setup

1. `npm run manifest:link` and open the printed URL in a Slack Developer
   Program sandbox to create the app from this app's manifest.
2. Install the app to your workspace.
3. On the app's Basic Information page, create an app-level token with the
   `connections:write` scope.
4. Copy `.env.example` to `.env.local`. Fill in `SLACK_BOT_TOKEN` (from OAuth
   & Permissions), `SLACK_APP_TOKEN` (the token from step 3), and
   `OPENROUTER_API_KEY`.
5. Paste the storefront's `DATABASE_URL` (from `apps/storefront/.env.local`)
   into `.env.local`.
6. `npm install`
7. `npm run db:seed`. The warehouse ends on the day you seed, so run this
   again on the workshop day.
8. `npm run dev`
9. DM the bot: "How did signups do last week compared with the week before?"

## What the agent does in Slack

- It shows a status message while it works.
- It streams the reply as it writes it.
- It shows each tool call as a task in a timeline.
- It adds a warning line when a tool call fails, for example a query outside
  the 90-day retention window.
- It names each thread after the first message.
- It stops the model call when the user presses Slack's stop button.
- It adds feedback buttons under each reply.
- In a DM, the Messages tab shows four suggested prompts from the manifest.

Every reply ends with a chart card and a table built from that turn's tool
results. QuickChart renders the chart from a URL. Slack fetches the image.
The bot makes no request. A URL over 3000 characters drops the chart, so
long ranges are bucketed by week.

Note: the manifest uses Slack's agent messaging experience (`agent_view`). An
app created from an older manifest must have its manifest replaced on the App
Manifest page at api.slack.com, then be reinstalled. Slack does not let an
app go back to the older assistant experience.

## Sentry

Set `SENTRY_DSN` in `.env.local` (`SENTRY_ENVIRONMENT` and `SENTRY_RELEASE`
are optional). Each handled Slack message becomes one trace: a root
`slack.message` span tagged with the Slack channel, the thread timestamp as
the conversation id, and whether content recording is on for that channel,
with the model call and its tool calls nested inside as `gen_ai` spans and
one `analytics.scan` span per warehouse query, each with a `db` child span
from the `pg` integration. The dev script starts Node with
`--import ./src/instrument.ts`, so Sentry loads before `pg`. A runner that
compiles TypeScript itself, such as tsx, skips that hook and shows no db
spans. The Sentry user is the Slack user who sent the message. Errors go to
Sentry as issues.

## Regression

`regressions/drop-prompt-cache.patch` removes the cache breakpoint from the
system prompt, so Anthropic caches nothing and cached input tokens fall to
zero on every turn. Apply from the repository root with
`git apply apps/slack-agent/regressions/drop-prompt-cache.patch`.
