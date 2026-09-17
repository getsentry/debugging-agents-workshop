# Solution: instrument the slack-agent

`instrumentation.patch` adds Sentry (`@sentry/node` 11.0.0-rc.0) to
`apps/slack-agent`, wired for agent tracing on the Vercel AI SDK call.

## Files it adds or changes

- `src/instrument.ts` — Sentry init: DSN and tracing, plus
  `consoleLoggingIntegration()` so the bot's `console.log`/`console.error`
  lines become Sentry logs. v11 enables the Vercel AI integration and records
  AI inputs, outputs, and the user by default, so no opt-in flags are needed.
  Postgres spans come from the SDK's built-in pg integration.
- `src/app.ts` — imports `instrument.ts` first, before `@slack/bolt` and the
  agent. Wraps each handled message (app_mention and DM) in one
  `Sentry.startSpan` (a root span, which is a segment in v11) tagged with the
  Slack channel and the thread timestamp as the conversation id, factored
  into a shared `handleMessage`. Scopes the Sentry user to the Slack user per
  message and captures errors before the existing error reply.
- `src/agent.ts` — unchanged; v11 records AI telemetry by default.
- `.env.example` — adds `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`
  (the last two are read automatically by the SDK).
- `README.md` — adds a Sentry section.
- `package.json` / `package-lock.json` — adds the `@sentry/node` dependency.

SDK: @sentry/node 11.0.0-rc.0

## Env vars it needs

```
SENTRY_DSN=            # this project's DSN
SENTRY_ENVIRONMENT=    # optional; read automatically by the SDK
SENTRY_RELEASE=        # optional; read automatically by the SDK
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
