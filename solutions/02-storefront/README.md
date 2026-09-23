# Solution: instrument the storefront

`instrumentation.patch` adds Sentry (`@sentry/nextjs` 11.0.0) to
`apps/storefront`, wired for agent tracing on the Vercel AI SDK route.

## Files it adds or changes

- `sentry.server.config.ts` — server init: DSN and tracing only. v11 records
  AI inputs, outputs, and the user by default, and enables the Vercel AI
  integration by default, so no opt-in flags are needed.
- `instrumentation.ts` — loads the server config for the Node.js runtime only;
  wires `onRequestError` for Server Component and proxy errors.
- `instrumentation-client.ts` — browser init with session replay and router
  transition tracing.
- `next.config.ts` — wraps the config with `withSentryConfig` (imported from
  `@sentry/nextjs/config`) for source map upload, skipped when
  `SENTRY_AUTH_TOKEN` is unset.
- `app/api/chat/route.ts` — sets the Sentry user and `gen_ai.conversation.id`
  per request and captures `streamText`'s `onError`.
- `.env.example` — adds `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
- `package.json` / `package-lock.json` — adds the `@sentry/nextjs` dependency.

`lib/db` is untouched: it runs real Postgres queries through `pg`, which
Sentry's Node SDK auto-instruments into `db.query` spans once the server
config is loaded.

SDK: @sentry/nextjs 11.0.0

## Env vars it needs

```
SENTRY_DSN=               # server DSN
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
