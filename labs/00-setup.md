# Lab 0. Setup

Do this before the workshop. Budget 15 minutes. On the day, only the last
step runs, during the introduction.

## 1. Accounts

| Service | Why | Cost |
| --- | --- | --- |
| [Sentry](https://sentry.io/signup/) | Where the traces, issues, dashboards, and alerts live | Free plan |
| OpenRouter | The model behind all three agents | The presenter shares one at the start; no account needed |
| [GitHub](https://github.com/signup) | Lab 5 runs an agent in GitHub Actions on your own repo | Free |

Sentry: create one organization. Do not create projects yet. Your coding agent
creates them in Lab 2.

## 2. A coding agent with Sentry attached

Any coding agent works. The labs are prompts. The presenter uses Claude Code.

| Agent | Steps |
| --- | --- |
| Claude Code | `claude plugin install sentry@claude-plugins-official`, then run `/sentry:sentry-get-started` once and complete the browser login when asked |
| Cursor, Codex, Windsurf, others | Add the MCP server `https://mcp.sentry.dev/mcp` in your agent's MCP settings. Complete the browser login when asked. Optional: copy the skills from <https://github.com/getsentry/plugin-claude> into your agent's skills folder |

Check: ask your agent "list my Sentry organizations". It must answer with
your organization name.

## 3. Tools

- Node 22 or newer: `node --version`
- git
- The `sentry` CLI: `curl https://cli.sentry.dev/install -fsS | bash`, then `sentry auth login`

## 4. Clone and run the setup script

```sh
git clone https://github.com/getsentry/debugging-agents-workshop
cd debugging-agents-workshop
./scripts/setup.sh
```

The script:

1. Checks Node.
2. Installs the storefront dependencies.
3. Creates a Postgres database on Neon. No account is needed. The database
   lives for 72 hours. To keep it in a free Neon account, run
   `npx neon@latest claim accept` from `apps/storefront` before it expires.
4. Seeds the catalog, customers, orders, and payments.
5. Asks for the OpenRouter API key.

Then:

```sh
cd apps/storefront
npm run dev
```

Open <http://localhost:3000>, open the chat panel, and ask
"What do you have in the shoes collection?". A reply with product cards means
you are ready.

## If something fails

- The Neon step fails: run `npx neon@latest claim create --file .env.local`
  from `apps/storefront`, then run `./scripts/setup.sh` again. The script
  skips the Neon step when `DATABASE_URL` is already set. Older packages
  named `neondb` and `neon-new` are deprecated; do not use them.
- OpenRouter returns 401: the key is wrong or was rotated; ask the presenter
  for the current one.
- The chat replies but shows no cards: check the terminal for a database
  error and rerun `npm run db:seed`.
