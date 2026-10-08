import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The exam clock on a timed writing homework.
 *
 * Everything here works from `timer_started_at` on the submission, written
 * once by the server. The rule the student is shown — once started it cannot
 * be stopped or restarted — only holds if the deadline is derived from that
 * stored moment, so a refresh, a second tab or a closed laptop all land on
 * the same remaining time, and a browser clock that is wrong or nudged
 * changes nothing.
 *
 * A grace period covers the gap between the clock running out and the page
 * managing to submit: a save that arrives a few seconds late is the student's
 * last keystrokes, not a cheat.
 */

const graceSeconds = 20;

export type TimerState = {
  /** Minutes allowed; 0 for an untimed homework. */
  minutes: number;
  startedAt: string | null;
  /** Seconds left, floored at 0. Null when untimed or not started. */
  remainingSeconds: number | null;
  expired: boolean;
};

export function readTimer(timedMinutes: number | null | undefined, startedAt: string | null | undefined, now = Date.now()): TimerState {
  const minutes = Math.max(0, Number(timedMinutes || 0));
  if (!minutes) return { minutes: 0, startedAt: null, remainingSeconds: null, expired: false };
  if (!startedAt) return { minutes, startedAt: null, remainingSeconds: minutes * 60, expired: false };

  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return { minutes, startedAt: null, remainingSeconds: minutes * 60, expired: false };

  const elapsed = Math.floor((now - started) / 1000);
  const remaining = minutes * 60 - elapsed;
  return {
    minutes,
    startedAt,
    remainingSeconds: Math.max(0, remaining),
    expired: remaining <= 0
  };
}

/** True once even the grace period is gone, which is when a save is refused. */
export function isPastGrace(timedMinutes: number | null | undefined, startedAt: string | null | undefined, now = Date.now()) {
  const minutes = Math.max(0, Number(timedMinutes || 0));
  if (!minutes || !startedAt) return false;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return (now - started) / 1000 > minutes * 60 + graceSeconds;
}

/**
 * The clock for one student on one homework: the earliest start recorded
 * across every submission they have for it.
 *
 * A student can legitimately have more than one submission row for the same
 * homework, and two tabs pressing start at the same moment can create another.
 * Taking the earliest means an extra row can never hand back time — the worst
 * a race can do is start the clock a few milliseconds early.
 */
export async function readStudentTimer(supabase: SupabaseClient, assignmentId: string, studentName: string) {
  const { data, error } = await supabase
    .from("submissions")
    .select("id, timer_started_at, submitted_at")
    .eq("assignment_id", assignmentId)
    .ilike("student_name", studentName)
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data || [];
  const started = rows.map((row) => row.timer_started_at as string | null).filter((value): value is string => Boolean(value));
  const earliest = started.sort()[0] || null;
  return { rows, startedAt: earliest, submissionId: (rows[rows.length - 1]?.id as string) || "" };
}

/**
 * Starts the clock, or hands back the moment it already started.
 *
 * The write is conditional on `timer_started_at` still being null, and the
 * answer is read back across all of the student's rows, so whichever tab wins
 * a race, every tab ends up on the same — earliest — deadline.
 */
export async function startTimer(supabase: SupabaseClient, assignmentId: string, studentName: string, submissionId: string) {
  const existing = await readStudentTimer(supabase, assignmentId, studentName);
  if (existing.startedAt) return existing.startedAt;

  await supabase
    .from("submissions")
    .update({ timer_started_at: new Date().toISOString() })
    .eq("id", submissionId)
    .is("timer_started_at", null);

  const settled = await readStudentTimer(supabase, assignmentId, studentName);
  return settled.startedAt;
}
