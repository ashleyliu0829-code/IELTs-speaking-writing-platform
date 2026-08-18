import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "@/lib/monitoring";

Sentry.init({
  ...sharedOptions,
  environment: process.env.NODE_ENV,
  integrations: [
    // Most routes handle their own failures and return a 500 body rather than
    // throwing, so onRequestError never sees them. They do log first, so
    // capturing console.error picks those up without editing every handler.
    Sentry.captureConsoleIntegration({ levels: ["error"] })
  ]
});
