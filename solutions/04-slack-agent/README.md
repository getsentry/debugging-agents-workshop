# Solution: instrument the slack-agent

`instrumentation.patch` adds Sentry (`@sentry/node` 11.0.0) to
`apps/slack-agent`, the Lighthouse Analytics bot. It wires up one trace per
Slack message, with a low-cardinality `analytics.scan` span per warehouse
query so a direct message still shows something useful even though its
prompt and reply are never recorded.

## Files it adds or changes

- `src/instrument.ts` — Sentry init: DSN, release, environment, and tracing,
  plus a `dataCollection` block that turns AI content recording off by
  default. `src/app.ts` imports it first.
- `src/app.ts` — wraps the body of the shared `respond()` (mention and DM) in
  one root `Sentry.startSpan`, tagged with the Slack channel, the thread
  timestamp as the conversation id, and whether content recording is on for
  that channel. The span runs inside `Sentry.withIsolationScope` and
  `Sentry.startNewTrace`, because Bolt handles every event in one long-lived
  process and each message would otherwise join the previous message's
  trace. Scopes the Sentry user to the Slack user per message and captures
  errors before the existing error reply.
- `src/agent.ts` — passes a per-call `telemetry` override to `streamText` so
  the AI SDK's own inputs/outputs recording follows the same channel-vs-DM
  rule as the root span.
- `src/analytics/tools.ts` — wraps each warehouse `scan()` in its own
  `Sentry.startSpan` (`analytics.scan`), with the metric, the range length,
  and the row count as attributes. The `pg` integration instruments the
  query itself, so each scan gets a `db` child span for free. The dev script
  starts Node with `--import ./src/instrument.ts`, so Sentry loads before
  `pg`. A runner that compiles TypeScript itself, such as tsx, skips that
  hook and shows no db spans.
- `.env.example` — adds `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`.
- `package.json` / `package-lock.json` — adds the `@sentry/node` dependency.
  The dev script gains `--import ./src/instrument.ts`.

SDK: @sentry/node 11.0.0

## Env vars it needs

```
SENTRY_DSN=            # this project's DSN
SENTRY_ENVIRONMENT=    # optional; defaults to "development"
SENTRY_RELEASE=        # optional; tags every span and error with it
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
