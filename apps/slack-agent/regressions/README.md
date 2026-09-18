# regressions

Patches that reintroduce a bug for a lab exercise.

- `drop-prompt-cache.patch` - removes the cache breakpoint from the system
  prompt, so Anthropic caches nothing and cached input tokens fall to zero on
  every turn. Apply from the repository root with
  `git apply apps/slack-agent/regressions/drop-prompt-cache.patch`, so
  `git apply` finds the `apps/slack-agent/...` paths.
