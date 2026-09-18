# Solution: instrument the pr-reviewer

`instrumentation.patch` adds Sentry (`@sentry/node@11.0.0-rc.0`,
`@flue/opentelemetry@2.0.3`) to `apps/pr-reviewer`, wired through Flue's
OpenTelemetry adapter.

## Files it adds or changes

- `src/sentry.ts` — Sentry init: DSN, environment (`github-actions` in CI,
  `local` otherwise), release from `GITHUB_SHA`, tracing,
  `enableOpenTelemetrySetup: true` (v11 no longer takes over OpenTelemetry by
  default, so this makes Sentry the global tracer provider the adapter's
  spans flow into), AI-provider integrations filtered out (pi-ai depends on
  the `openai` package, so those integrations would double count every model
  call Flue already traces), `beforeSendSpan` remapping `flue.tool.call.*` to
  `gen_ai.tool.call.*`, and a flush-on-dispose instrument registered before
  the OpenTelemetry adapter so the flush runs after it ends its spans. v11
  records AI inputs, outputs, and the user by default.
- `src/agents/review.ts` — imports `../sentry.ts` first.
- `.github/workflows/review.yml` (repository root) — adds `SENTRY_DSN` to the
  run step's env.
- `.env.example` — adds `SENTRY_DSN`.
- `README.md` — adds a Sentry section.
- `package.json` / `package-lock.json` — adds the two dependencies.

SDK: @sentry/node 11.0.0-rc.0

## Env vars it needs

```
SENTRY_DSN=    # this project's DSN, set locally and as a repository secret
```
`gh secret set SENTRY_DSN`

## Apply / undo

Apply: `./scripts/solution.sh pr-reviewer`

Undo: `git checkout -- apps/pr-reviewer && git clean -fd apps/pr-reviewer`

Each delegation opens its own Flue conversation, so Explore > Conversations
shows three rows per run: the lead, the correctness reviewer, and the style
reviewer.
