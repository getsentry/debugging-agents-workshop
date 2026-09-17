# pr-reviewer

A flue agent that reviews a unified diff. A lead agent loads the diff,
delegates one task each to a correctness-reviewer and a style-reviewer, then
synthesizes the two passes into a single Markdown review (a one-line verdict
followed by findings ordered by severity) and posts it once. Model: Claude
Haiku 4.5 through OpenRouter; pi-ai reads `OPENROUTER_API_KEY`.

## Run it locally

```
OPENROUTER_API_KEY=... npm install
OPENROUTER_API_KEY=... npm run demo
```

`npm run demo` reviews `fixtures/sample.diff`. `npm run demo:fix` reviews
`fixtures/fix.diff`. Without `POST_TO_GITHUB=true` set, the review is written
to `review.md` instead of posted to a pull request.

## Install it in a repository

1. Copy this app's contents to the root of the target repository.
2. Add the OpenRouter API key as a repository secret:
   ```
   gh secret set OPENROUTER_API_KEY
   ```
3. Open a pull request. `.github/workflows/review.yml` runs on `opened` and
   `synchronize`, diffs the PR against its base branch, and posts the review
   as a PR comment.

## Sentry

This app has no Sentry code. Sentry instrumentation is added in
`labs/05-pr-reviewer.md`.
