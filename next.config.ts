import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Browser reports post to this app's origin and the server relays them, so a
  // blocked or slow route to sentry.io never costs the user anything. Must match
  // the `tunnel` value in src/instrumentation-client.ts.
  tunnelRoute: "/monitoring",

  // Uploading source maps needs SENTRY_AUTH_TOKEN; without one the build should
  // still succeed rather than fail a deploy over telemetry.
  silent: !process.env.CI,
  // Strips Sentry's own debug logging from the client bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN
  }
});
