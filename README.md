# Debugging agents in different environments

Three AI agents run in three environments: a browser chat, a Slack bot, and
a GitHub Actions job. Each one is instrumented with Sentry agent tracing, so
every turn shows up as one trace with the model calls, the tool calls, the
token counts, and the cost inside it. Nobody instrumented these apps by hand:
every step was a prompt to a coding agent with Sentry's MCP server attached.
The prompts are in [PROMPTS.md](PROMPTS.md). The slides are in
[docs/debugging-agents-workshop.pdf](docs/debugging-agents-workshop.pdf).

| App | Environment | Stack | Where Sentry is wired |
| --- | --- | --- | --- |
| [`apps/storefront`](apps/storefront) | Browser chat in a Next.js app | Next.js, Vercel AI SDK, Postgres on Neon | `sentry.server.config.ts`, `instrumentation-client.ts`, `app/api/chat/route.ts` |
| [`apps/slack-agent`](apps/slack-agent) | Long-lived Slack bot | Node, Bolt (Socket Mode), Vercel AI SDK | `src/instrument.ts`, `src/app.ts`, `src/agent.ts` |
| [`apps/pr-reviewer`](apps/pr-reviewer) | GitHub Actions job | Node, Flue (OpenTelemetry) | `src/sentry.ts`, `.github/workflows/review.yml` |

All three call Claude Sonnet 5 through OpenRouter.

## You need

- A Sentry account: <https://sentry.io/signup/>
- An OpenRouter API key: <https://openrouter.ai/keys>
- Node 22.18 or newer, and git
- A coding agent with Sentry's MCP server. Claude Code:
  `claude plugin install sentry@claude-plugins-official`. Other agents: add
  <https://mcp.sentry.dev/mcp>.
- The `sentry` CLI, signed in, for the scripts below:
  <https://github.com/getsentry/cli>

## Run the apps

```sh
git clone https://github.com/getsentry/debugging-agents-workshop
cd debugging-agents-workshop
./scripts/setup.sh
```

The script sets up the storefront: it checks Node, creates a Postgres
database on Neon, seeds it, and asks for your OpenRouter key. Each app's
README has its own setup and run steps, and a Sentry section that says what
its traces contain.

## Dashboards and monitors

The dashboards and monitors from the workshop, as scripts you run against
your own org. Without `--push` each script prints the JSON and sends nothing.

```sh
node scripts/dashboards/create.mjs slack-agent <org-slug> <project-id> --push
node scripts/alerts/create.mjs slack-agent <org-slug> <project-slug> --email <user-id> --push
```

Dashboard templates: `slack-agent`, `storefront`, `pr-reviewer`. Monitor
templates: `slack-agent` (cache misses on model calls) and `storefront`
(refund tool failures, model call failure rate, slow agent turns, token spend
spike). `--slack <channel-id>` adds a Slack action whose note mentions
@Sentry, so Seer starts on the alert as soon as it posts. Your user id is the
`user.id` field in `sentry api organizations/<org-slug>/members/`.

## License

MIT. See [LICENSE](LICENSE). The storefront is built on Vercel's Next.js
Commerce template, and its MIT license is in
[apps/storefront/license.md](apps/storefront/license.md).
