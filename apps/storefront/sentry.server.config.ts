import * as Sentry from "@sentry/nextjs";

// v11 records AI inputs, outputs, and the user by default — no opt-in flags needed.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1,
});
