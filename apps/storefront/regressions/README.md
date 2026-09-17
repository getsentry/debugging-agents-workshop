# Planted regressions

`drop-cache-key.patch` removes the `promptCacheKey` from the chat route. Every
turn then sends a prefix Mistral cannot match, so cached input tokens fall to
zero and the cost per conversation rises about three times.

The presenter applies it live as a new release:

    git apply regressions/drop-cache-key.patch

Revert with `git apply -R regressions/drop-cache-key.patch`.
