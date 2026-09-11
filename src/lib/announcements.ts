/**
 * Platform-wide notices, shown at the top of the teacher's activity feed and
 * the student's notification list.
 *
 * They live in code rather than a table because only the platform owner
 * posts them and it happens a few times a year — a deploy is the publish
 * step. Add a new entry at the top; drop one when it is stale. `until` is the
 * last day it shows, so a notice retires itself without another deploy.
 */

export type PlatformAnnouncement = {
  id: string;
  /** ISO date the notice was posted; shown as its time. */
  at: string;
  /** Last day (YYYY-MM-DD) the notice is shown, inclusive. */
  until: string;
  zh: string;
  en: string;
};

export const platformAnnouncements: PlatformAnnouncement[] = [
  {
    id: "bank-2026-09",
    at: "2026-09-11T00:00:00+08:00",
    until: "2026-10-11",
    zh: "9~12月口语题库已更新",
    en: "The September–December speaking topic bank is now live"
  }
];

export function activeAnnouncements(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return platformAnnouncements.filter((notice) => notice.until >= today);
}
