import * as Sentry from "@sentry/nextjs";
import { DEMO_USER } from "lib/demo-user";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 1,
  integrations: [
    // Records the page as the shopper saw it. Elements marked
    // data-sentry-mask (the account card's name and email) stay masked.
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: false,
      blockAllMedia: false,
    }),
  ],
});

// The store has no sign-in; a real app calls setUser after the user signs in.
Sentry.setUser({ ...DEMO_USER });

// Instruments App Router navigations so client traces connect to server ones.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
