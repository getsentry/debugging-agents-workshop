import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  // Prompts and replies are off by default for this app; src/agent.ts turns
  // them on per call when the message is in a channel.
  dataCollection: { genAI: { inputs: false, outputs: false } },
});
