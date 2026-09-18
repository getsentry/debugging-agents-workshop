# regressions

`per-file-fanout.patch` changes step 2 of the lead's instructions so it
delegates one `correctness-reviewer` task per changed file, each with the
complete diff text, plus one `style-reviewer` task, all in one batch. It also
adds a sentence to the `correctness-reviewer` description noting that it
reviews a single file in the context of the whole diff.

Each subagent starts a fresh conversation, so Anthropic caches nothing for it:
the lead's own calls keep their cache reads, but every extra subagent pays
the full diff at the uncached input price. An eight-file pull request costs
about eight times a one-file one, and the review comment looks the same.

Apply it from the repository root, so `git apply` finds the
`apps/pr-reviewer/...` paths:

```
git apply apps/pr-reviewer/regressions/per-file-fanout.patch
```

Revert with `git apply -R` and the same path. To see the effect without a
pull request, run `npm run demo` (one changed file) and `npm run demo:large`
(eleven changed files) before and after the patch.
