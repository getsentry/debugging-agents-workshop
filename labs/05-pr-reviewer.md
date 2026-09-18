# Lab 5. An agent that runs in CI

10 minutes. Follow-along. Repeat it after the workshop with
`apps/pr-reviewer/README.md`.

`apps/pr-reviewer` is a Flue agent that runs in GitHub Actions on every pull
request. A lead agent reads the diff, sends it to two subagents, one for
correctness and one for style, merges their findings, and posts one comment
on the pull request. It runs on Claude Sonnet 5 through OpenRouter and has
no Sentry.

What changes compared with the storefront and Slack:

- The process lives for one run and then exits. Nothing is sent unless the
  SDK flushes before exit.
- There is no user. The identity that matters is the repository, the pull
  request number, and the commit.
- Flue is not the Vercel AI SDK. It emits OpenTelemetry spans with `gen_ai`
  attributes for the lead, each subagent, and each tool.
- The cost driver is tokens per run, not tokens per conversation.

## Step 1. Instrument by prompt

Start your coding agent in `apps/pr-reviewer` and send:

> Instrument this Flue agent with Sentry so every GitHub Actions run produces
> one trace. Create a new Sentry project for it in my organization. I need:
> - Flue's OpenTelemetry spans exported to Sentry, so the lead, both
>   subagents, and the tools show as nested gen_ai spans with token counts.
> - The release set to the commit SHA and the environment set to
>   `github-actions`, with `local` when I run `npm run demo` on my machine.
> - The repository and pull request number as tags on every span.
> - A flush before the process exits, so the last spans are not lost.
> - Full trace sampling.
> Use the 11.0 release candidate of the Sentry SDK, npm tag `next`. Add only
> what these points need.
> Add the `SENTRY_DSN` secret to `.github/workflows/review.yml`. Then run
> `npm run demo` against `fixtures/sample.diff` and show me the resulting
> trace.

Watch for:

- Whether it finds Flue's OpenTelemetry package or tries to patch the model
  calls by hand. The right answer is a span exporter, not a wrapper.
- Whether it flushes. A CI run without a flush sends nothing and reports
  success.
- Whether both subagents land in the lead's trace. Flue starts each task
  outside the lead's span context, so a plain exporter setup opens one trace
  per subagent. The finished result hands the adapter the lead span as the
  root for every child session.

## If your agent is still running

Switch to the finished result and continue:

```sh
./scripts/solution.sh pr-reviewer
```

Set `SENTRY_DSN` in `apps/pr-reviewer/.env.local` and as a repository secret,
then continue with Step 2.

## Step 2. Verify

Ask:

> Find the latest trace in the pr-reviewer project. Show the lead span, the
> two subagent spans, and the total input tokens for the run.

You must see one root span for the run, two subagent spans under it, and a
`post_review` tool span at the end.

## Step 3. Ship the regression

First look at the cache columns of the run from Step 2. The lead's second,
third, and fourth calls read the cached prefix of the call before them. The
two subagent calls read nothing: each subagent starts a fresh conversation
with the full diff, so the diff is paid at the uncached input price once per
subagent.

The presenter applies `apps/pr-reviewer/regressions/per-file-fanout.patch`
from the repository root. The lead now sends one correctness task per changed
file, each with the full diff. The presenter opens a pull request that
touches eight files with the patch in it; the workflow runs the patched
reviewer on that pull request.

Ask:

> Compare the last two releases of the pr-reviewer project: total input
> tokens, cached input tokens, and the number of subagent spans per run.

The eight-file run has nine subagent spans instead of two, and the extra
input tokens are all uncached. Nobody sees this in the pull request comment.
It is only visible in the trace.

## What you learned

- In a short-lived process, ask for the flush. Ask for the release and the
  environment, or every run looks the same.
- Flue and other OpenTelemetry frameworks need an exporter prompt, not an
  "add the SDK" prompt.
- Cost regressions in fan-out agents scale with the input, and every fresh
  subagent conversation is uncached. Compare runs, not single spans.
