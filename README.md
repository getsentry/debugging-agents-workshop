# Debugging Agents in Different Environments

A one-hour workshop. Three AI agents run in three environments. Each can fail
across several steps, so the final answer is only part of the story. You use
your coding agent, with Sentry's MCP server and skills attached, to add agent
tracing, verify it, find the failures, and set up the dashboards and alerts
that matter for each critical path.

Nobody instruments by hand. Every step is a prompt. The workshop teaches what
to ask for and how to check the result.

## Three ways in

Your coding agent reaches Sentry in three ways. The labs use all three, and
each lab names the one that did the work.

| Way | What it is | Where the labs use it |
|---|---|---|
| MCP server | `mcp.sentry.dev`. Tools such as `search_issues`, `search_events`, `get_trace_details`, `analyze_issue_with_seer`, and `update_issue`. The agent calls them while it works. | Lab 3 finds the issue, pulls the trace and the replay, and triages it. Lab 6 triages the issue an alert opens. |
| Plugin skills | `sentry-instrument`, `sentry-debug-issue`, `sentry-create-alert`, and others from <https://github.com/getsentry/plugin-claude>. Step-by-step instructions the agent follows on top of the MCP tools. Claude Code gets them from the `sentry` plugin. Other agents can copy them. | Labs 2 and 4 instrument. Lab 3 debugs. Lab 6 creates alerts. |
| `sentry` CLI | `sentry issue list`, `view`, `explain`, `plan`, `resolve`; `sentry agent-conversation list`, `view`; `sentry alert`; `sentry dashboard create`. Runs in any terminal and in CI, and the agent can call it too. | Lab 3 shows the same issue from the terminal. Lab 6 creates the dashboard and lists the alerts. |

| App | Environment | Runtime | You do |
| --- | --- | --- | --- |
| `apps/storefront` | Browser chat on a Next.js app | Next.js, Vercel AI SDK, Postgres on Neon | Hands-on |
| `apps/slack-agent` | Long-lived Slack bot | Node, Bolt (Socket Mode), Vercel AI SDK, same Postgres | Follow along |
| `apps/pr-reviewer` | GitHub Actions job | Node, Flue (OpenTelemetry), OpenRouter | Follow along |

All three call Claude Sonnet 5 through OpenRouter: the storefront and the
Slack agent through the Vercel AI SDK, and the PR reviewer through Flue. The
presenter shares one OpenRouter key at the start
of the workshop, so no account is needed. Neon's instant Postgres needs no
account either.

## Before the workshop

Do these once, before the day. Each takes a few minutes. See
[`labs/00-setup.md`](labs/00-setup.md) for the details.

1. A Sentry account: <https://sentry.io/signup/>
2. An OpenRouter API key: the presenter shares one at the start of the
   workshop, so no account is needed.
3. A coding agent with Sentry's MCP server attached. Claude Code users install
   the `sentry` plugin. Other agents add <https://mcp.sentry.dev/mcp>.
4. Node 22 and git.

Then:

```sh
git clone https://github.com/getsentry/debugging-agents-workshop
cd debugging-agents-workshop
./scripts/setup.sh
```

The script checks Node, creates a Postgres database on Neon, seeds it, and
asks for your OpenRouter key and Sentry DSN.

## Labs

| # | Lab | Minutes |
| --- | --- | --- |
| 0 | [Setup](labs/00-setup.md) | before the day |
| 1 | [Read a trace](labs/01-read-a-trace.md) | 5 |
| 2 | [Instrument the storefront by prompt](labs/02-instrument-storefront.md) | 10 |
| 3 | [Debug the refund that fails](labs/03-debug-refund.md) | 10 |
| 4 | [The same agent in Slack](labs/04-slack-agent.md) | 10 |
| 5 | [The same agent in GitHub Actions](labs/05-pr-reviewer.md) | 10 |
| 6 | [Alerts and dashboards for each critical path](labs/06-critical-paths.md) | 10 |

Every prompt is also in [PROMPTS.md](PROMPTS.md), ready to paste.

Coding agents take different amounts of time and produce different diffs.
Nobody waits for a prompt to finish. When the room moves on, apply the
finished instrumentation for the current app and continue:

```sh
./scripts/solution.sh storefront    # or slack-agent, pr-reviewer
```

`solutions/<lab>/` holds each patch and a README that lists what it adds,
so you can compare it with what your agent did.

## Reference

The fully instrumented versions of these apps live at
<https://github.com/getsentry/sentry-agent-tracing-examples>.

The same Slack assistant also exists on Vercel's eve agent framework, in
`slack-agent-eve` and `slack-agent-eve-otel` in that repo. eve receives
Slack events over a webhook and needs a Vercel deploy, so it is not used
in the labs. It shows what changes when a framework owns the spans: one
version uses the Sentry SDK inside eve's OpenTelemetry pipeline, the other
exports OTLP straight to Sentry.

## License

MIT. See [LICENSE](LICENSE). The storefront is built on Vercel's Next.js
Commerce template, and its MIT license is in
[apps/storefront/license.md](apps/storefront/license.md).
