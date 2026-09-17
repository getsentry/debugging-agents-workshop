# Lab 2. Instrument the storefront by prompt

10 minutes. Hands-on.

The storefront has a shopping assistant at `/api/chat`. It has four tools:
search products, get product, get account info, refund order. It runs on the
Vercel AI SDK with Mistral, and reads Postgres on Neon. It has no Sentry.

You add agent tracing with one prompt to your coding agent. Then you verify
the result through Sentry's MCP server, not by clicking around.

## Step 1. The weak prompt

Start your coding agent in `apps/storefront` and send:

> Add Sentry to this app.

Read what it plans before it runs. Typical result: the SDK is installed,
errors are captured, tracing may be on, and nothing about the agent is
recorded. The trace shows an HTTP request and nothing inside it.

Undo the change: `git checkout -- . && git clean -fd` in `apps/storefront`.

## Step 2. The prompt that describes the outcome

> Instrument this Next.js app with Sentry. Create a new Sentry project for it
> in my organization. I need:
> - Agent tracing for the Vercel AI SDK calls in `app/api/chat/route.ts`,
>   with inputs and outputs recorded, so I can read the prompt, the tool
>   calls, the tool results, and the token usage per step.
> - The conversation id from the chat request body set on every span in the
>   request, and the demo user from `lib/demo-user.ts` set as the Sentry user.
> - Database spans for the Postgres queries in `lib/db`.
> - Session replay in the browser, so a failed chat turn links to what the
>   user saw.
> - Full trace sampling for the workshop.
> When done, start the dev server, send one chat message that searches the
> shoes collection, then query Sentry for the resulting trace and show me the
> gen_ai spans with their token counts.

What to watch while it works:

- Which skill or docs it reads first. The Sentry skills know the `gen_ai`
  semantics; a generic agent guesses.
- Whether it turns on input and output recording. The SDK default is off in
  production-shaped setups.
- Whether it verifies over MCP at the end, or only says "done".

## Step 3. Verify

Ask:

> Find the latest trace in the storefront project. List every span with its
> op, its duration, and for gen_ai spans the model, input tokens, and output
> tokens. Which tool ran, and what did it return?

You must see, nested under one request:

1. One agent span for the assistant turn.
2. One or more model calls, each with `gen_ai.request.model`,
   `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`.
3. One tool span per tool call, with its arguments and result.
4. `db.query` spans under the tool span.

If a level is missing, tell the agent which one, and let it fix it.

## Checkpoint

Send a second chat message in the same conversation. Ask your agent:

> Show me all traces for conversation id `<id>` in the storefront project.

Two traces share the conversation id. Paste the Sentry link to the second
trace in the workshop channel.

## What you learned

- Name the signals you need. "Add Sentry" gets errors. "Agent tracing with
  inputs, outputs, conversation id, user, db spans, replay" gets the trace
  you can debug with.
- Ask the agent to verify through Sentry, not through its own output.
- The `solutions/02-storefront/` folder has the presenter's transcript and
  the resulting diff for comparison.
