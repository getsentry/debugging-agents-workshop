# regressions

Patches that reintroduce a bug for a lab exercise.

- `drop-cache-key.patch` - removes the `promptCacheKey` provider option, so
  repeated turns in a conversation stop sharing Mistral's prompt cache.
  Apply with `git apply regressions/drop-cache-key.patch` from
  `apps/slack-agent`.
