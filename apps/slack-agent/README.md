# slack-agent

A Slack bot that answers shopping questions in a DM or when mentioned. It
reuses the storefront's tools (`searchProducts`, `getProduct`,
`getAccountInfo`, `refundOrder`) and the same Postgres database, so it can
search the catalog and manage the same demo customer's orders - just as
plain Slack text instead of cards. It reads the whole thread on every
message, so follow-ups like "refund that order" work.

## Setup

1. From the repo root, run `scripts/setup.sh` first. It installs the
   storefront, provisions a Postgres database, and seeds it.
2. `npm run manifest:link` and open the printed URL in a Slack Developer
   Program sandbox to create the app from this app's manifest.
3. Install the app to your workspace.
4. On the app's Basic Information page, create an app-level token with the
   `connections:write` scope.
5. Copy `.env.example` to `.env.local`. Fill in `SLACK_BOT_TOKEN` (from OAuth
   & Permissions) and `SLACK_APP_TOKEN` (the token from step 4), plus
   `OPENROUTER_API_KEY` and the `DATABASE_URL` from
   `apps/storefront/.env.local`.
6. `npm install`
7. `npm run dev`
8. DM the bot: "show me the shoes collection".

## What the agent does in Slack

- It shows a status message while it works.
- It streams the reply as it writes it.
- It shows each tool call as a task in a timeline.
- It adds feedback buttons under each reply.
- In a DM, it shows an assistant panel with suggested prompts.

Note: an app created before this manifest must have its manifest updated on
the App Manifest page at api.slack.com, then be reinstalled. This gives the
app the assistant panel and the feedback buttons.

Sentry is added to this app in `labs/04-slack-agent.md`.
