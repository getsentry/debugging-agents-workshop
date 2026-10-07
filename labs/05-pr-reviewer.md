# Lab 5. An agent that runs in CI

10 minutes. Follow-along. Repeat it after the workshop with
`apps/pr-reviewer/README.md`.

`apps/pr-reviewer` is a Flue agent that runs in GitHub Actions on every pull
request. A lead agent reads the diff, sends it to two subagents, one for
correctness and one for style, merges their findings, and posts one comment
on the pull request. Before the verdict it runs the tests the diff touches.
It runs on Claude Sonnet 5 through OpenRouter. `src/sentry.ts` sends one
trace per run to Sentry.

What changes compared with the storefront and Slack:

- The process lives for one run and then exits. Nothing is sent unless the
  SDK flushes before exit.
- There is no user. The identity that matters is the repository, the pull
  request number, and the commit.
- Flue is not the Vercel AI SDK. It emits OpenTelemetry spans with `gen_ai`
  attributes for the lead, each subagent, and each tool.
- The cost driver is tokens per run, not tokens per conversation.

## Step 1. How it got instrumented

The prompt that produced `src/sentry.ts`, sent to a coding agent in
`apps/pr-reviewer`:

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

What the agent had to get right:

- Whether it finds Flue's OpenTelemetry package or tries to patch the model
  calls by hand. The right answer is a span exporter, not a wrapper.
- Whether it flushes. A CI run without a flush sends nothing and reports
  success.
- Whether both subagents land in the lead's trace. Flue starts each task
  outside the lead's span context, so a plain exporter setup opens one trace
  per subagent. The finished result hands the adapter the lead span as the
  root for every child session.

## Step 2. Verify

Ask:

> Find the latest trace in the pr-reviewer project. Show the lead span, the
> two subagent spans, and the total input tokens for the run.

You must see one root span for the run, two subagent spans under it, a
`run_tests` tool span, and a `post_review` tool span at the end.

## Step 3. Ship the slow tests

First look at the cache columns of the run from Step 2. The lead's second and
later calls read the cached prefix of the call before them: the system prompt,
the tool list, and the conversation so far. pi-ai, the model client under
Flue, marks that prefix for caching on every call, and OpenRouter forwards it
to Anthropic's prompt cache. The cache lives five minutes.

The presenter opens a pull request that changes
`fixtures/demo-pr/cart-total.ts`. The lead reads the diff, delegates the two
review passes, then calls `run_tests`. That file is imported by
`checkout-flow.integration.test.ts`, a fixture whose six tests each wait
80 seconds, so the tool call runs about eight minutes. When the lead asks for
the verdict, the five-minute cache has expired. The verdict call pays the full
uncached input price for a prefix the run already paid for once.

Ask:

> Show the chat spans of the latest pr-reviewer run with input tokens, cached
> input tokens, and start time. Which call read nothing from the cache, and
> what ran right before it?

The pull request comment looks the same as on a fast run. Only the trace shows
the eight-minute `run_tests` span and the verdict call with zero cached
tokens after it.

## Step 4. The fix

One line in `.github/workflows/review.yml`: `PI_CACHE_RETENTION: long`. pi-ai
then asks for the one-hour cache. Re-run the pull request. The verdict call
reads the cache again. The run is not faster; the tests still take their
time. The second full price is gone. The other fix is to run the tests before
the first model call.

## What you learned

- In a short-lived process, ask for the flush. Ask for the release and the
  environment, or every run looks the same.
- Flue and other OpenTelemetry frameworks need an exporter prompt, not an
  "add the SDK" prompt.
- A prompt cache has a lifetime. A tool call that outlives it makes the next
  model call pay full price. The comment does not show it. The trace does.
