# regressions

`per-file-fanout.patch` changes `src/agents/review.ts` step 2 so the lead
delegates one `correctness-reviewer` task per changed file (each with the
complete diff text), plus one `style-reviewer` task, all in one batch. It also
adds a sentence to the `correctness-reviewer` description noting that it
reviews a single file in the context of the whole diff.

Apply it live during the workshop with:

```
git apply regressions/per-file-fanout.patch
```
