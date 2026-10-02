# regressions

Patches that reintroduce a bug for a lab exercise.

- `drop-prompt-cache.patch` - removes the cache breakpoint from the system
  prompt, so Anthropic caches nothing and cached input tokens fall to zero on
  every turn. Apply from the repository root with
  `git apply apps/slack-agent/regressions/drop-prompt-cache.patch`, so
  `git apply` finds the `apps/slack-agent/...` paths.

In the presenter flow, the same change ships as a pull request from the
branch `lab4-drop-prompt-cache` into `main`, and the Cursor automation
"Sentry issue to fix PR" restores it with a pull request of its own.
