# Acme Store — AI Shopping Assistant

A storefront with an AI shopping assistant embedded in it: the workshop's
starting point, before any of the instrumentation the labs add.

Built on the [Next.js Commerce](https://github.com/vercel/commerce) template
(MIT © Vercel, Inc. — see `license.md`), keeping its storefront UI intact.

## Architecture

- **Storefront** — Next.js Commerce on Next 16 (App Router, PPR, `use cache`).
  Its Shopify data layer is replaced by `lib/commerce`, exposing the same
  functions and types, so every template component works unchanged.
- **Database** — `lib/db` is Postgres (Neon), queried through Drizzle: 12
  products, five collections, six customers, their orders, and payments.
  `lib/db/schema.ts` defines the tables; `scripts/db-seed.ts` seeds them from
  the fixed catalog in `lib/db/data.ts`.
- **Assistant** — a slide-over chat panel (AI Elements + `useChat`) streaming
  from `app/api/chat`, which runs `streamText` against Claude Sonnet 5
  through OpenRouter with four tools: `searchProducts`, `getProduct`,
  `getAccountInfo`, and `refundOrder`.
  Tool results render as **generative UI** — product cards and an account
  card. The store has no sign-in; `lib/demo-user` is the one shopper.
- **The planted bug** — `refundOrder` calls `selectPayment` in
  `lib/db/index.ts`, which throws for orders placed before the payments
  system launched in June 2026: those orders have no row in the `payments`
  table, because the backfill never ran. Debug it with tracing in
  `../../labs/03-debug-refund.md`.

## Setup

Requires Node.js >= 22. From the repo root:

```bash
./scripts/setup.sh
```

This installs dependencies, provisions a free Postgres database on Neon (or
reuses `DATABASE_URL` if already set), seeds it, and asks for an OpenRouter
API key. By hand instead:

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and OPENROUTER_API_KEY
npm run db:seed
```

## Run

```bash
npm run dev
```

Then click the sparkles button (bottom right) and try "Find me a hoodie",
"Where is my order?", "Refund my last order", or "Refund order 1029" (the
planted bug above).

See `../../labs/` for the rest of the workshop.
