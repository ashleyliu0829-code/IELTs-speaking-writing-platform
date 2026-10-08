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
 * Starts the clock, or hands back the moment it already started.
 *
 * The write is conditional on `timer_started_at` still being null, so two
 * tabs pressing start at once cannot give the second one a fresh hour.
 */
export async function startTimer(supabase: SupabaseClient, submissionId: string) {
  const { data: current, error } = await supabase
    .from("submissions")
    .select("id, timer_started_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!current) throw new Error("Submission not found.");
  if (current.timer_started_at) return current.timer_started_at as string;

  const startedAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("submissions")
    .update({ timer_started_at: startedAt })
    .eq("id", submissionId)
    .is("timer_started_at", null)
    .select("timer_started_at")
    .maybeSingle();
  if (claimed?.timer_started_at) return claimed.timer_started_at as string;

  // Someone else claimed it between the read and the write; theirs stands.
  const { data: settled } = await supabase.from("submissions").select("timer_started_at").eq("id", submissionId).maybeSingle();
  return (settled?.timer_started_at as string) || startedAt;
}
