"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { planProgress, sortPhases, suggestPhases, type StudyPlanPhase } from "@/lib/studyPlan";
import { useLanguage } from "@/lib/i18n";

/**
 * The study plan as the student and the teacher both see it: one bar from
 * the first phase to the exam, split by phase, filled up to today, with the
 * phase list under it. The teacher also gets an editor for the phases.
 */

export function StudyPlanBar({ phases, today, compact = false }: { phases: StudyPlanPhase[]; today: Date; compact?: boolean }) {
  const { t } = useLanguage();
  const progress = useMemo(() => planProgress(phases, today), [phases, today]);
  if (!progress) return null;
  const current = progress.currentIndex >= 0 ? progress.phases[progress.currentIndex].phase : null;
  const headline =
    progress.state === "before"
      ? t("计划还没开始", "Not started yet")
      : progress.state === "after"
        ? t("计划已走完", "Plan complete")
        : current
          ? t(`第 ${progress.currentIndex + 1} 阶段 · ${current.name}`, `Phase ${progress.currentIndex + 1} · ${current.name}`)
          : "";

  return (
    <div className={`study-plan ${compact ? "compact" : ""}`}>
      <div className="study-plan-head">
        <strong className="study-plan-percent">{progress.percent}%</strong>
        <div>
          <div className="study-plan-headline">{headline}</div>
          <small>
            {t(`已过 ${progress.elapsedDays} 天，共 ${progress.totalDays} 天`, `Day ${progress.elapsedDays} of ${progress.totalDays}`)}
          </small>
        </div>
      </div>

      <div className="study-plan-bar" role="img" aria-label={t(`学习计划完成 ${progress.percent}%`, `Study plan ${progress.percent}% through`)}>
        {progress.phases.map(({ phase, share, done }, index) => (
          <div
            className={`study-plan-segment ${done >= 1 ? "done" : done > 0 ? "current" : ""}`}
            key={phase.id}
            style={{ flexGrow: share }}
            title={`${phase.name} ${phase.start_date} – ${phase.end_date}`}
          >
            <span className="study-plan-fill" style={{ width: `${Math.round(done * 100)}%` }} />
            {!compact && <span className="study-plan-segment-label">{index + 1}</span>}
          </div>
        ))}
      </div>

      <ol className="study-plan-phases">
        {progress.phases.map(({ phase, done }, index) => {
          const state = done >= 1 ? "done" : done > 0 ? "current" : "todo";
          return (
            <li className={`study-plan-phase ${state}`} key={phase.id}>
              <span className="study-plan-dot" aria-hidden="true">{index + 1}</span>
              <div>
                <div className="study-plan-phase-name">
                  <strong>{phase.name}</strong>
                  <span className={`pill plan-state ${state}`}>
                    {state === "done" ? t("已完成", "Done") : state === "current" ? t("进行中", "Now") : t("未开始", "Upcoming")}
                  </span>
                </div>
                <small>
                  {formatRange(phase.start_date, phase.end_date)}
                  {!compact && phase.focus ? ` · ${phase.focus}` : ""}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StudyPlanDialog({
  studentName,
  examDate,
  phases,
  today,
  saving,
  onClose,
  onSave
}: {
  studentName: string;
  examDate: string | null;
  phases: StudyPlanPhase[];
  today: Date;
  saving: boolean;
  onClose: () => void;
  onSave: (phases: StudyPlanPhase[]) => void;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement | null>(null);
  const [drafts, setDrafts] = useState<StudyPlanPhase[]>(() => sortPhases(phases));
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function update(id: string, patch: Partial<StudyPlanPhase>) {
    setDrafts((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function add() {
    const last = drafts[drafts.length - 1];
    const start = last ? nextDay(last.end_date) : today.toISOString().slice(0, 10);
    const end = examDate && examDate > start ? examDate : start;
    setDrafts((list) => [...list, { id: `${Date.now().toString(36)}-${list.length}`, name: "", start_date: start, end_date: end, focus: "" }]);
  }

  function submit() {
    const cleaned = drafts.map((item) => ({ ...item, name: item.name.trim(), focus: item.focus.trim() }));
    if (cleaned.some((item) => !item.name || !item.start_date || !item.end_date)) {
      setError(t("每个阶段都要有名称和起止日期。", "Every phase needs a name and both dates."));
      return;
    }
    if (cleaned.some((item) => item.end_date < item.start_date)) {
      setError(t("有阶段的结束日期早于开始日期。", "A phase ends before it starts."));
      return;
    }
    setError("");
    onSave(sortPhases(cleaned));
  }

  const previewable = drafts.filter((item) => item.start_date && item.end_date && item.end_date >= item.start_date);

  return (
    <dialog className="student-dialog wide" ref={ref} onCancel={onClose} onClose={onClose}>
      <form method="dialog" className="student-dialog-body" onSubmit={(event) => event.preventDefault()}>
        <div className="section-head compact">
          <div>
            <h3>{t(`${studentName} 的学习计划`, `Study plan for ${studentName}`)}</h3>
            <div className="hint">
              {t("按阶段写：名称、起止日期、这个阶段要做什么。学生首页会看到进度条。", "Phases with a name, dates and a one-line focus. The student sees it as a progress bar.")}
            </div>
          </div>
          <button className="btn link" type="button" onClick={onClose}>
            {t("关闭", "Close")}
          </button>
        </div>

        {previewable.length > 0 && <StudyPlanBar phases={previewable} today={today} compact />}

        <div className="study-plan-editor">
          {drafts.map((item, index) => (
            <div className="study-plan-edit-row" key={item.id}>
              <span className="study-plan-dot" aria-hidden="true">{index + 1}</span>
              <input
                value={item.name}
                placeholder={t("阶段名称，如 基础提升", "Phase name, e.g. Foundations")}
                onChange={(event) => update(item.id, { name: event.target.value })}
              />
              <input type="date" value={item.start_date} onChange={(event) => update(item.id, { start_date: event.target.value })} />
              <span className="study-plan-edit-to">–</span>
              <input type="date" value={item.end_date} min={item.start_date} onChange={(event) => update(item.id, { end_date: event.target.value })} />
              <button
                className="btn ghost"
                type="button"
                onClick={() => setDrafts((list) => list.filter((entry) => entry.id !== item.id))}
                aria-label={t("删除", "Remove")}
              >
                ✕
              </button>
              <input
                className="study-plan-edit-focus"
                value={item.focus}
                placeholder={t("这个阶段的重点（可不填）", "Focus of this phase (optional)")}
                onChange={(event) => update(item.id, { focus: event.target.value })}
              />
            </div>
          ))}
          {!drafts.length && <p className="hint">{t("还没有阶段。", "No phases yet.")}</p>}
        </div>

        <div className="overview-month-row">
          <button className="btn ghost" type="button" onClick={add}>
            {t("+ 添加阶段", "+ Add phase")}
          </button>
          {examDate && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                const suggested = suggestPhases(today, examDate);
                if (suggested.length) setDrafts(suggested);
                else setError(t("考试日期已过，无法自动生成。", "The exam date has passed."));
              }}
            >
              {t("按考试日期生成三阶段", "Suggest 3 phases to the exam")}
            </button>
          )}
          {!examDate && <small className="hint">{t("先在“编辑”里填考试日期，就能一键生成三阶段。", "Set the exam date under Edit to get a suggested plan.")}</small>}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="student-dialog-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <button className="btn" type="button" onClick={submit} disabled={saving}>
            {saving ? t("保存中...", "Saving...") : t("保存计划", "Save plan")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function nextDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatRange(from: string, to: string) {
  const short = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  return from.slice(0, 4) === to.slice(0, 4) ? `${short(from)} – ${short(to)}` : `${from} – ${to}`;
}
