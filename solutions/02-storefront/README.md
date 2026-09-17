# Solution: instrument the storefront

`instrumentation.patch` adds Sentry (`@sentry/nextjs` 10.70.0) to
`apps/storefront`, wired for agent tracing on the Vercel AI SDK route.

## Files it adds or changes

- `sentry.server.config.ts` — server init: DSN, tracing, logs, PII,
  `vercelAIIntegration({ recordInputs: true, recordOutputs: true })`.
- `sentry.edge.config.ts` — same init shape for the edge runtime (unused today).
- `instrumentation.ts` — loads the right config per runtime; wires
  `onRequestError` for Server Component and proxy errors.
- `instrumentation-client.ts` — browser init with session replay and router
  transition tracing.
- `next.config.ts` — wraps the config with `withSentryConfig` for source map
  upload (skipped when `SENTRY_AUTH_TOKEN` is unset) and a tunnel route.
- `app/api/chat/route.ts` — sets the Sentry user and `gen_ai.conversation.id`
  per request, turns on `recordInputs`/`recordOutputs` telemetry, and
  captures `streamText`'s `onError`.
- `app/error.tsx`, `app/global-error.tsx` — capture the exception each React
  error boundary receives (Sentry's global handlers never see these).
- `.env.example` — adds `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
- `package.json` / `package-lock.json` — adds the `@sentry/nextjs` dependency.

`lib/db` is untouched: it runs real Postgres queries through `pg`, which
Sentry's Node SDK auto-instruments into `db.query` spans once the server
config is loaded.

## Env vars it needs

```
SENTRY_DSN=               # server/edge DSN
NEXT_PUBLIC_SENTRY_DSN=   # same DSN, exposed to the browser bundle
SENTRY_ORG=                # for source map upload
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=         # optional; upload is skipped without it
```

## Apply / undo

Apply:

```
./scripts/solution.sh storefront
```

Undo:

```
git checkout -- apps/storefront && git clean -fd apps/storefront
```
