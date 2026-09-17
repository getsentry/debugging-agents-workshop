# Planted regressions

`drop-prompt-cache.patch` removes the `providerOptions` cache breakpoint from
the chat route's system message. Every turn then sends a prefix Anthropic
cannot match, so cached input tokens fall to zero and the cost per
conversation rises about three times.

The presenter applies it live as a new release:

    git apply regressions/drop-prompt-cache.patch

Revert with `git apply -R regressions/drop-prompt-cache.patch`.
