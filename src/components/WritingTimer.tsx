"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";

/**
 * The exam clock on a timed writing homework.
 *
 * Three states the student can be in, and the page is different in each: not
 * started (a dialog explaining the rule, which is the only thing on screen),
 * running (a clock pinned to the corner), and finished (the paper is in and
 * the page is locked behind a dialog that cannot be dismissed).
 *
 * Time left is never counted here. It is handed down from the server's
 * `startedAt` and recomputed from the wall clock on every tick, so a tab that
 * was asleep for twenty minutes wakes up twenty minutes poorer rather than
 * carrying on where its interval left off.
 */

export type WritingTimerState = {
  minutes: number;
  startedAt: string | null;
  remainingSeconds: number | null;
  expired: boolean;
};

export function WritingTimer({
  timer,
  starting,
  onStart,
  onExpire
}: {
  timer: WritingTimerState;
  starting: boolean;
  onStart: () => void;
  onExpire: () => void;
}) {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(() => secondsLeft(timer));
  const fired = useRef(false);

  useEffect(() => {
    setRemaining(secondsLeft(timer));
    if (!timer.startedAt || timer.expired) return;
    const tick = window.setInterval(() => setRemaining(secondsLeft(timer)), 1000);
    return () => window.clearInterval(tick);
  }, [timer.startedAt, timer.minutes, timer.expired]);

  // The hand-off to auto-submit happens once, whether the clock ran out while
  // the page was open or had already run out before it loaded.
  useEffect(() => {
    if (fired.current) return;
    if (!timer.startedAt) return;
    if (remaining > 0 && !timer.expired) return;
    fired.current = true;
    onExpire();
  }, [remaining, timer.expired, timer.startedAt, onExpire]);

  if (!timer.minutes) return null;

  if (!timer.startedAt) {
    return (
      <div className="exam-overlay" role="dialog" aria-modal="true">
        <div className="exam-dialog">
          <h2>{t("这是一份计时作文", "This paper is timed")}</h2>
          <p className="exam-dialog-rule">
            {t(
              `该作文计时 ${timer.minutes} 分钟，请准备好后点击开始。开始后，无法停止或者重启计时。如有意外情况，请联系老师。`,
              `You have ${timer.minutes} minutes. Press start when you are ready. Once started the clock cannot be stopped or restarted. If something goes wrong, contact your teacher.`
            )}
          </p>
          <button className="btn" type="button" onClick={onStart} disabled={starting}>
            {starting ? t("正在开始...", "Starting...") : t("开始", "Start")}
          </button>
        </div>
      </div>
    );
  }

  if (remaining <= 0 || timer.expired) {
    return (
      <div className="exam-overlay" role="dialog" aria-modal="true">
        <div className="exam-dialog">
          <h2>{t("倒计时已结束", "Time is up")}</h2>
          <p className="exam-dialog-rule">
            {t("倒计时已结束，作文已自动提交，请退出页面。", "The time is up. Your paper has been submitted automatically. You can close this page.")}
          </p>
        </div>
      </div>
    );
  }

  const low = remaining <= 300;
  return (
    <div className={`exam-clock ${low ? "low" : ""}`} role="timer" aria-live="off">
      <span className="exam-clock-label">{t("剩余时间", "Time left")}</span>
      <strong>{formatClock(remaining)}</strong>
    </div>
  );
}

function secondsLeft(timer: WritingTimerState) {
  if (!timer.minutes) return 0;
  if (!timer.startedAt) return timer.minutes * 60;
  const started = new Date(timer.startedAt).getTime();
  if (Number.isNaN(started)) return timer.minutes * 60;
  return Math.max(0, timer.minutes * 60 - Math.floor((Date.now() - started) / 1000));
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
