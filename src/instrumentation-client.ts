import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "@/lib/monitoring";

Sentry.init({
  ...sharedOptions,
  environment: process.env.NODE_ENV,
  // Browsers here are on mainland networks, where a direct connection to
  // sentry.io is unreliable and often blocked outright. Reports go to this
  // app's own origin instead, and the server forwards them on.
  tunnel: "/monitoring",
  // Session replay would capture homework text and student names on screen.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
