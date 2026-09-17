# Lab 6. Alerts and dashboards for each critical path

10 minutes. Hands-on for the storefront; the presenter shows the other two.

A trace answers "what happened once". A dashboard answers "is it happening
again". An alert answers "tell me before a user does". Each app has one or
two paths where a failure costs money or trust. Name them, then make the
signal.

## Step 1. Name the critical path

| App | Critical path | Signal |
| --- | --- | --- |
| Storefront | Refund tool | Tool error rate on `refundOrder` |
| Storefront | Every chat turn | Tokens and cost per conversation |
| Slack agent | A thread that never gets an answer | Turns with no `gen_ai.response` span |
| PR reviewer | Cost per review run | Cache hit rate per release |

## Step 2. One alert by prompt

Ask your coding agent:

> In the storefront Sentry project, create an alert that fires when the
> `refundOrder` tool errors more than 3 times in 10 minutes, and another
> that fires when a single conversation uses more than 50,000 input tokens.
> Notify by email. Show me both alerts and the query each one uses.

The Sentry skills use the workflow engine API for this. Watch which span
attributes it filters on. If it picks a metric that does not exist yet, tell
it to look at the last trace first.

## Step 3. One dashboard by CLI

The Sentry plugin has no dashboard skill, so this goes through the `sentry`
CLI. Ask:

> Use the sentry CLI to create a dashboard called "Storefront agent" in my
> org with two widgets: total input and output tokens per day grouped by
> `gen_ai.request.model`, and a table of the top 10 conversations by input
> tokens with their user. Then open it.

Check the queries it writes. `scripts/dashboards/` in this repo has the
presenter's versions of these widgets, plus the cache hit rate per release
widget from Lab 5.

## Step 4. The presenter shows the other two

- Slack agent: an alert on threads with a turn that started but never
  produced a response span.
- PR reviewer: the cache hit rate per release widget, with the Lab 5
  regression visible as a drop between two releases.

## Checkpoint

Trigger the refund failure three times fast. The alert email arrives. Paste
the alert link in the workshop channel.

## What you learned

- Start from the path that costs money, not from the metric the tool offers.
- Alerts and dashboards are prompts too. The agent needs the attribute names,
  and the trace has them.
