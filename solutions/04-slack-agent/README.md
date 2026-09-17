# Solution: instrument the slack-agent

`instrumentation.patch` adds Sentry (`@sentry/node` 10.75.0) to
`apps/slack-agent`, wired for agent tracing on the Vercel AI SDK call.

## Files it adds or changes

- `src/instrument.ts` — Sentry init: DSN, environment, release, tracing,
  logs, PII, `vercelAIIntegration({ recordInputs: true, recordOutputs: true })`.
  Postgres spans come from the SDK's built-in pg integration.
- `src/app.ts` — imports `instrument.ts` first, before `@slack/bolt` and the
  agent. Wraps each handled message (app_mention and DM) in one
  `Sentry.startSpan` transaction tagged with the Slack channel and the thread
  timestamp as the conversation id, factored into a shared `handleMessage`.
  Scopes the Sentry user to the Slack user per message, captures errors
  before the existing error reply, mirrors the bot's own log lines to
  `Sentry.logger`, and flushes on `SIGINT`/`SIGTERM`.
- `src/agent.ts` — turns on `recordInputs`/`recordOutputs` telemetry on the
  existing `functionId`.
- `.env.example` — adds `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`.
- `README.md` — adds a Sentry section.
- `package.json` / `package-lock.json` — adds the `@sentry/node` dependency.

## Env vars it needs

```
SENTRY_DSN=            # this project's DSN
SENTRY_ENVIRONMENT=    # optional, defaults to "development"
SENTRY_RELEASE=        # optional, the release the presenter tagged
```

## Apply / undo

Apply:

```
./scripts/solution.sh slack-agent
```

Undo:

```
git checkout -- apps/slack-agent && git clean -fd apps/slack-agent
```
