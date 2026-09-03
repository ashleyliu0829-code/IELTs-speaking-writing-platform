#!/usr/bin/env node
//
// Sends one test event and reports whether Sentry accepted it.
//
//   node scripts/check-sentry.mjs
//
// Worth running on the server as well as locally: the code path is identical,
// but reaching sentry.io from a mainland or Hong Kong host is not guaranteed,
// and a blocked connection looks exactly like "no errors happening".

import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    })
);

const dsn = env.NEXT_PUBLIC_SENTRY_DSN;
if (!dsn) {
  console.error("NEXT_PUBLIC_SENTRY_DSN is not set in .env.local — nothing to test.");
  process.exit(1);
}

const host = new URL(dsn).host;
console.log(`DSN host: ${host}`);

// Reachability first: a blocked network is the likeliest failure here, and it
// is easier to read as a connection error than as a silent non-delivery.
const started = Date.now();
try {
  const response = await fetch(`https://${host}/api/0/`, { method: "GET" });
  console.log(`Reachable: HTTP ${response.status} in ${Date.now() - started}ms`);
} catch (error) {
  console.error(`Not reachable: ${error.message}`);
  console.error("Sentry will silently drop everything from this host.");
  process.exit(1);
}

Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false });

const eventId = Sentry.captureMessage(`Delivery check from ${process.platform} at ${new Date().toISOString()}`);
console.log(`Event id: ${eventId}`);

const delivered = await Sentry.flush(15000);
console.log(delivered ? "Flushed: the event was sent." : "Flush timed out: the event was NOT delivered.");
console.log("\nOpen the Sentry issues page and look for the message above.");
process.exit(delivered ? 0 : 1);
