# Lab 6. Alerts and dashboards for each critical path

10 minutes. Hands-on for the storefront; the presenter shows the other two.

A trace answers "what happened once". A dashboard answers "is it happening
again". An alert answers "tell me before a user does". Each app has one or
two paths where a failure costs money or trust. Name them, then make the
signal.

## Step 1. Name the critical path

| App | Critical path | What goes wrong | Signal |
| --- | --- | --- | --- |
| Storefront | Refund tool | The tool fails and the agent apologises | Errored `refundOrder` tool spans, more than 3 in 10 minutes |
| Storefront | Every chat turn | The provider rate-limits or is down | Failure rate of model calls above 10% over 5 minutes |
| Storefront | Every chat turn | The customer waits and leaves | p95 of an agent turn above 15 seconds over 10 minutes |
| Storefront | Token spend | A loop or a prompt change burns money | Input tokens per hour far above the recent baseline (anomaly) |
| Slack agent | A thread that never gets an answer | The socket died, nobody noticed | Agent turns per hour drop to zero during work hours |
| PR reviewer | Cost per review run | A change removes the cache prefix or adds subagents | Cache hit rate per release drops |

Two of these are not thresholds a human would pick well. "50,000 tokens in
one conversation" sounds reasonable, but Sentry alerts aggregate over a time
window; grouping by conversation is a gated feature, so the detector API
refuses it. Ask for the top conversations as a dashboard table instead and
put the alert on the hourly total with anomaly detection.

## Step 2. One alert by prompt

Ask your coding agent:

> In the storefront Sentry project, create two alerts that email me. The
> first fires when the `refundOrder` tool errors more than 3 times in 10
> minutes. The second fires when more than 10% of the model calls fail over
> 5 minutes. Look at an existing detector in the org for the payload shape
> first. Show me both alerts and the query each one uses.

The Sentry skills use the workflow engine API for this. The legacy
alert-rules endpoint fails on this org, and the detector payload needs
values no error message tells you (`events_analytics_platform`,
`trace_item_span`, the 75/50/0 condition codes), which is why the prompt
says to look at an existing detector. Watch which span attributes it
filters on: the model call is `gen_ai.operation.name:generate_content`,
not `chat`. If it picks a metric that does not exist yet, tell it to look
at the last trace first.

If there is time, add the third: "an anomaly alert on input tokens per
hour". The agent has to know `detectionType: dynamic` and the
`anomaly_detection` condition shape; the presenter's copy is in
`scripts/alerts/storefront-critical-paths.json`.

## Step 3. One dashboard by CLI

The Sentry plugin has no dashboard skill, so this goes through the `sentry`
CLI. Ask:

> Use the sentry CLI to create a dashboard called "Storefront agent" in my
> org with two widgets: total input and output tokens per day grouped by
> `gen_ai.request.model`, and a table of the top 10 conversations by input
> tokens with their user. Then open it.

Check the queries it writes. Compare them with the presenter's version:

    node scripts/dashboards/agent-critical-paths.mjs <org> <project-id>

It prints the dashboard JSON with five widgets: cache hit rate by release,
input tokens by release, the most expensive conversations, tool calls with
failures, and model latency. Add `--push` to create it through the CLI.

## Step 4. The presenter shows the other two

- Storefront: the other two alerts, slow turns and the token anomaly, and
  the "Group by Metric Alerts" refusal when you ask for one alert per
  conversation.
- Slack agent: an alert on agent turns per hour dropping to zero. The bot
  runs over one socket; when it dies, Slack shows nothing.
- PR reviewer: the cache hit rate per release widget, with the Lab 5
  regression visible as a drop between two releases.

## Checkpoint

Trigger the refund failure three times fast. The alert email arrives. Paste
the alert link in the workshop channel.

## What you learned

- Start from the path that costs money, not from the metric the tool offers.
- Alerts and dashboards are prompts too. The agent needs the attribute names,
  and the trace has them.
