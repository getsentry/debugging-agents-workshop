# Planted regressions

`drop-prompt-cache.patch` removes the `providerOptions` cache breakpoint from
the chat route's system message. Every turn then sends a prefix Anthropic
cannot match, so cached input tokens fall to zero and the cost per
conversation rises about three times.

The presenter applies it live as a new release, from the repository root so
`git apply` finds the `apps/storefront/...` paths:

    git apply apps/storefront/regressions/drop-prompt-cache.patch

Revert with `git apply -R apps/storefront/regressions/drop-prompt-cache.patch`.
