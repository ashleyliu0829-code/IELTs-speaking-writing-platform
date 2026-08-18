import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Shared Sentry options.
 *
 * This app handles student names, phone numbers and transcript text. None of
 * that belongs in a third-party error tracker, so PII is off by default and
 * anything that routinely carries a name or number is stripped below. What is
 * left is enough to debug with: the route, the stack, and the account id.
 */

export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

/** Query keys that carry a student's identity rather than a filter value. */
const sensitiveQueryKeys = ["studentName", "phone", "teacherPhone", "studentAccountId"];

/** Body/context keys worth removing wherever they appear. */
const sensitiveKeys = new Set([
  "studentName",
  "student_name",
  "displayName",
  "display_name",
  "phone",
  "teacherPhone",
  "password",
  "token",
  "transcript",
  "transcript_text",
  "corrected_transcript_text",
  "responseText",
  "response_text"
]);

export function scrubUrl(url: string) {
  try {
    const parsed = new URL(url, "http://local");
    for (const key of sensitiveQueryKeys) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "[redacted]");
    }
    return url.startsWith("http") ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKeys.has(key) ? "[redacted]" : scrubDeep(item, depth + 1)
    ])
  );
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (!sentryDsn) return null;

  if (event.request?.url) event.request.url = scrubUrl(event.request.url);
  if (event.request?.query_string) event.request.query_string = "[redacted]";
  // Request bodies here are homework answers and recordings metadata.
  if (event.request?.data) event.request.data = "[redacted]";
  if (event.request?.cookies) delete event.request.cookies;

  if (event.extra) event.extra = scrubDeep(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubDeep(event.contexts) as typeof event.contexts;

  // Identify the workspace, never the person.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  event.breadcrumbs = event.breadcrumbs?.map((crumb) =>
    crumb.data?.url ? { ...crumb, data: { ...crumb.data, url: scrubUrl(String(crumb.data.url)) } } : crumb
  );

  return event;
}

export const sharedOptions = {
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  // Never let the SDK attach IPs, cookies or user agents on its own.
  sendDefaultPii: false,
  // Errors matter for the trial; traces are a cost with little payoff yet.
  tracesSampleRate: 0,
  beforeSend
};
