# pr-reviewer

A flue agent that reviews a unified diff. A lead agent loads the diff,
delegates one task each to a correctness-reviewer and a style-reviewer, then
synthesizes the two passes into a single Markdown review (a one-line verdict
followed by findings ordered by severity) and posts it once. Model: Claude
Sonnet 5 through OpenRouter; pi-ai reads `OPENROUTER_API_KEY`.

## Run it locally

```
OPENROUTER_API_KEY=... npm install
OPENROUTER_API_KEY=... npm run demo
```

`npm run demo` reviews `fixtures/sample.diff`, `npm run demo:large` reviews
`fixtures/large.diff` (eleven changed files). `npm run demo:fix` reviews
`fixtures/fix.diff`. Without `POST_TO_GITHUB=true` set, the review is written
to `review.md` instead of posted to a pull request.

## Run it on pull requests

GitHub only runs workflows from the repository root. The workflow for this
app is `.github/workflows/review.yml` at the root of this repository. It runs
only for pull requests that change `apps/pr-reviewer/`, and it runs every step
inside `apps/pr-reviewer`.

1. Add the OpenRouter API key as a repository secret:
   ```
   gh secret set OPENROUTER_API_KEY
   ```
2. Open a pull request that changes a file in `apps/pr-reviewer/`. The
   workflow runs on `opened` and `synchronize`, diffs the PR against its base
   branch, and posts the review as a PR comment.

In a fork, enable Actions on the fork first. A pull request from a fork to
this repository does not get the secrets, so open the pull request inside
your fork.

To use the agent in another repository, copy this app to that repository's
root, copy the workflow, and remove the `paths` filter and the
`working-directory` default.

## Sentry

Set `SENTRY_DSN` (locally in `.env`, in CI as the `SENTRY_DSN` repository
secret) to send traces and logs to Sentry. One run produces a trace with a
root span for the lead agent, a chat span per lead model turn, a tool span
per `read_diff`/`post_review` call, and two subagent spans (one for
`correctness-reviewer`, one for `style-reviewer`) with their own chat and
tool spans nested underneath. `environment` is `github-actions` in CI and
`local` otherwise; `release` is the workflow's `GITHUB_SHA`.
