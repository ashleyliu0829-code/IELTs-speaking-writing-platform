"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coursePlanFamily, coursePlans } from "@/lib/coursePlans";
import type { StudentOverviewLesson, StudentOverviewRow } from "@/lib/types";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * The first page of the student archive: every student on one line.
 *
 * The dashboard already answers all of these questions, but one student at a
 * time and in five different places. What a teacher actually asks at the start
 * of a week — who is close to an exam, who has not been graded lately, who is
 * coming in tomorrow — needs the whole roster side by side, so this is a table
 * and not a set of cards.
 *
 * Editing happens in a dialog rather than in the cells. A row is meant to be
 * read across; controls scattered through it competed with the numbers, and
 * only two of these fields are the teacher's to set anyway.
 */

const monthOptions = [1, 2, 3, 6, 12];

type StudentEdit = {
  examDate: string | null;
  confirmed: boolean;
  coursePlan: string;
  isActive: boolean;
  /** Null means "use the automatic total". */
  taughtHours: number | null;
};

/** Marks the row that starts the stopped-students block, for the divider. */
function isFirstInactive(rows: StudentOverviewRow[], index: number) {
  return !rows[index].is_active && (index === 0 || rows[index - 1].is_active);
}

export function StudentOverviewPanel({
  onOpenStudent
}: {
  onOpenStudent?: (studentName: string) => void;
}) {
  const [rows, setRows] = useState<StudentOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<StudentOverviewRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  // Filtered by name only; inactive students keep their place at the bottom.
  const needle = search.trim().toLowerCase();
  const shown = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
  // Computed once. A countdown measured in days does not need to tick.
  const today = useMemo(() => startOfDay(new Date()), []);
  const { t } = useLanguage();

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/teacher/student-overview");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("学生档案加载失败。", "Could not load the student archive."));
      setRows(data.students || []);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("学生档案加载失败。", "Could not load the student archive."));
    } finally {
      setLoading(false);
    }
  }

  async function saveStudent(student: StudentOverviewRow, edit: StudentEdit) {
    setSaving(true);
    try {
      const response = await fetch("/api/teacher/student-overview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, ...edit })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));
      setRows((current) =>
        current
          .map((row) =>
            row.id === student.id
              ? {
                  ...row,
                  exam_date: data.student?.exam_date ?? null,
                  exam_date_confirmed: Boolean(data.student?.exam_date_confirmed),
                  course_plan: data.student?.course_plan ?? "",
                  is_active: data.student?.is_active !== false,
                  taught_hours_override: data.student?.taught_hours_override == null ? null : Number(data.student.taught_hours_override)
                }
              : row
          )
          // Stopping a student moves them down the list, so re-sort the way the
          // server does rather than leaving them out of order until a refresh.
          .sort((a, b) =>
            a.is_active === b.is_active
              ? a.name.localeCompare(b.name, "zh-Hans-CN")
              : a.is_active
                ? -1
                : 1
          )
      );
      setEditing(null);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("保存失败。", "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card stack student-overview">
      <div className="section-head compact">
        <div>
          <h2>{t("学生档案", "Student archive")}</h2>
        </div>
        <div className="overview-tools">
          <input
            className="overview-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("搜索学生姓名", "Search by name")}
            type="search"
          />
          <button className="btn secondary" type="button" onClick={load} disabled={loading}>
            {loading ? t("加载中...", "Loading...") : t("刷新", "Refresh")}
          </button>
        </div>
      </div>

      {status && <p className="error">{status}</p>}

      {!loading && !rows.length && <p className="hint">{t("还没有学生档案。学生注册或填写姓名后会出现在这里。", "No students yet. They appear here once they sign up or are added.")}</p>}

      {rows.length > 0 && !shown.length && <p className="hint">{t("没有匹配的学生。", "No matching students.")}</p>}

      {shown.length > 0 && (
        <div className="overview-scroll">
          <table className="overview-table">
            <thead>
              <tr>
                <th>{t("学生", "Student")}</th>
                <th>{t("学习时长", "Studying for")}</th>
                <th>{t("已上课时", "Lessons taught")}</th>
                <th>{t("当前水平", "Current level")}</th>
                <th>{t("距离考试", "Exam in")}</th>
                <th>{t("课程计划", "Course plan")}</th>
                <th>{t("下次上课", "Next lesson")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr
                  className={`${row.is_active ? "" : "inactive"} ${isFirstInactive(shown, index) ? "first-inactive" : ""}`}
                  key={row.id}
                >
                  <td>
                    <div className="overview-name">
                      {!row.is_active && <span className="pill stopped">{t("已停课", "Stopped")}</span>}
                      {onOpenStudent ? (
                        <button className="btn link" type="button" onClick={() => onOpenStudent(row.name)}>
                          {row.name}
                        </button>
                      ) : (
                        <strong>{row.name}</strong>
                      )}
                      <small>{row.account_id ? row.phone || t("已注册账号", "Registered") : t("未注册（老师手动添加）", "Not registered (added by teacher)")}</small>
                    </div>
                  </td>
                  <td>
                    <div className="overview-stack">
                      <strong>{formatDuration(row.registered_at, today)}</strong>
                      <small>
                        {row.registered_from_account ? t("注册于 ", "Signed up ") : t("首次记录 ", "First seen ")}
                        {formatDay(row.registered_at)}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div className="overview-stack">
                      <strong>{formatHours(row.taught_hours_override ?? row.taught_hours_auto)}</strong>
                      <small>{row.taught_hours_override == null ? t("按课程表统计", "From the schedule") : t("手动填写", "Entered by hand")}</small>
                    </div>
                  </td>
                  <td>
                    <div className="overview-levels">
                      <ScoreLine label={t("口语", "Speaking")} score={row.speaking?.score} at={row.speaking?.submitted_at} />
                      <ScoreLine label={t("写作", "Writing")} score={row.writing?.score} at={row.writing?.submitted_at} />
                    </div>
                  </td>
                  <td>
                    {row.exam_date ? (
                      <div className="overview-stack">
                        <strong className={examUrgencyClass(row.exam_date, today)}>
                          {formatCountdown(row.exam_date, today)}
                        </strong>
                        <small>
                          {row.exam_date_confirmed ? t("考试日 ", "Exam day ") : t("预计 ", "Estimated ")}
                          {formatDay(row.exam_date)}
                        </small>
                      </div>
                    ) : (
                      <em>{t("未确定", "Not set")}</em>
                    )}
                  </td>
                  <td>
                    {row.course_plan ? (
                      <span className={`pill plan ${coursePlanFamily(row.course_plan) || ""}`}>{row.course_plan}</span>
                    ) : (
                      <em>{t("未设置", "None")}</em>
                    )}
                  </td>
                  <td>
                    <NextLessonCell lesson={row.next_lesson} today={today} />
                  </td>
                  <td className="overview-actions">
                    <button className="btn ghost" type="button" onClick={() => setEditing(row)}>
                      {t("编辑", "Edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <StudentEditDialog
          student={editing}
          today={today}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={(edit) => saveStudent(editing, edit)}
        />
      )}
    </article>
  );
}

function ScoreLine({ label, score, at }: { label: string; score?: number; at?: string }) {
  const { t } = useLanguage();
  return (
    <div className="overview-level">
      <span>{label}</span>
      {score ? (
        <>
          <strong>{score.toFixed(1)}</strong>
          <small>{formatDay(at)}</small>
        </>
      ) : (
        <em>{t("暂无评分", "No score")}</em>
      )}
    </div>
  );
}

/**
 * Editing one student.
 *
 * A native <dialog> so Escape, the backdrop and focus handling come from the
 * browser rather than from three hooks that have to be kept right.
 *
 * The name, the phone and the registration date are shown but not editable.
 * They are not settings — the phone and the date belong to the account, and
 * the name is the key that ties a student to their submissions, their feedback
 * and their bookings, so changing it here would quietly detach their history.
 */
function StudentEditDialog({
  student,
  today,
  saving,
  onClose,
  onSave
}: {
  student: StudentOverviewRow;
  today: Date;
  saving: boolean;
  onClose: () => void;
  onSave: (edit: StudentEdit) => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [examDate, setExamDate] = useState(student.exam_date || "");
  const [confirmed, setConfirmed] = useState(student.exam_date_confirmed);
  const [coursePlan, setCoursePlan] = useState(student.course_plan || "");
  const [isActive, setIsActive] = useState(student.is_active);
  const [taughtHours, setTaughtHours] = useState(student.taught_hours_override == null ? "" : String(student.taught_hours_override));
  const { t } = useLanguage();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function submit() {
    onSave({
      examDate: examDate ? examDate : null,
      confirmed: examDate ? confirmed : false,
      coursePlan,
      isActive,
      taughtHours: taughtHours.trim() === "" ? null : Math.max(0, Number(taughtHours))
    });
  }

  return (
    <dialog className="student-dialog" ref={ref} onCancel={onClose} onClose={onClose}>
      <form method="dialog" className="student-dialog-body" onSubmit={(event) => event.preventDefault()}>
        <div className="section-head compact">
          <div>
            <h3>{t("编辑学生信息", "Edit student")}</h3>
            <div className="hint">{t("姓名、手机号和注册日期由账号决定，这里只作查看。", "Name, phone and sign-up date come from the account and are shown for reference.")}</div>
          </div>
          <button className="btn link" type="button" onClick={onClose}>
            {t("关闭", "Close")}
          </button>
        </div>

        <div className="student-dialog-facts">
          <div>
            <label>{t("学生姓名", "Name")}</label>
            <input value={student.name} readOnly />
          </div>
          <div>
            <label>{t("手机号码", "Phone")}</label>
            <input value={student.phone || t("未注册账号", "Not registered")} readOnly />
          </div>
          <div>
            <label>{t("注册日期", "Signed up")}</label>
            <input
              value={`${formatDay(student.registered_at)}${student.registered_from_account ? "" : t("（首次记录）", " (first seen)")}`}
              readOnly
            />
          </div>
        </div>

        <div className="student-dialog-field">
          <label>{t("考试时间", "Exam date")}</label>
          <input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
          <label className="check-row plain">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!examDate}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{t("日期已确定", "Date confirmed")}</span>
            <small>{t("不勾就当作预估，倒计时照样会走", "Unticked means an estimate; the countdown still runs")}</small>
          </label>
          <div className="overview-month-row">
            {monthOptions.map((months) => (
              <button
                className="btn ghost"
                key={months}
                type="button"
                onClick={() => {
                  setExamDate(addMonths(today, months));
                  setConfirmed(false);
                }}
              >
                {t(`${months} 个月后`, `in ${months} mo`)}
              </button>
            ))}
            {examDate && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setExamDate("");
                  setConfirmed(false);
                }}
              >
                {t("清除", "Clear")}
              </button>
            )}
          </div>
        </div>

        <div className="student-dialog-field">
          <label>{t("已上课时", "Lessons taught")}</label>
          <div className="overview-hours-row">
            <input
              type="number"
              min={0}
              step={0.5}
              value={taughtHours}
              onChange={(event) => setTaughtHours(event.target.value)}
              placeholder={String(student.taught_hours_auto)}
            />
            <span>{t("课时", "lessons")}</span>
            {taughtHours !== "" && (
              <button className="btn ghost" type="button" onClick={() => setTaughtHours("")}>
                {t("改回自动", "Use automatic")}
              </button>
            )}
          </div>
          <p className="hint">
            {t(`留空则按课程表自动统计（已确认且已过去的课，目前 ${student.taught_hours_auto} 课时）；填了数字就以填的为准。`, `Leave blank to total confirmed past lessons from the schedule (currently ${student.taught_hours_auto} lessons); a number here overrides it.`)}
          </p>
        </div>

        <div className="student-dialog-field">
          <label>{t("上课状态", "Status")}</label>
          <div className="segmented">
            <button
              className={`btn ${isActive ? "" : "secondary"}`}
              type="button"
              onClick={() => setIsActive(true)}
            >
              {t("在读", "Active")}
            </button>
            <button
              className={`btn ${isActive ? "secondary" : ""}`}
              type="button"
              onClick={() => setIsActive(false)}
            >
              {t("已停课", "Stopped")}
            </button>
          </div>
          <p className="hint">
            {t("停课的学生排在名单下方并转为灰色，作业、评分和排课记录都保留，随时可以改回在读。", "Stopped students sink to the bottom in grey; their homework, scores and bookings are kept, and they can be set active again any time.")}
          </p>
        </div>

        <div className="student-dialog-field">
          <label>{t("课程计划", "Course plan")}</label>
          <select value={coursePlan} onChange={(event) => setCoursePlan(event.target.value)}>
            <option value="">{t("未设置", "None")}</option>
            {coursePlans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </div>

        <div className="student-dialog-actions">
          <button className="btn secondary" type="button" onClick={onClose} disabled={saving}>
            {t("取消", "Cancel")}
          </button>
          <button className="btn" type="button" onClick={submit} disabled={saving}>
            {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function formatHours(hours: number) {
  const rounded = Math.round(hours * 10) / 10;
  return tr(`${rounded} 课时`, `${rounded} lessons`);
}

function NextLessonCell({ lesson, today }: { lesson: StudentOverviewLesson | null; today: Date }) {
  const { t } = useLanguage();
  if (!lesson) return <em className="hint">{t("未安排", "None booked")}</em>;

  return (
    <div className="overview-stack">
      <strong>{formatLessonTime(lesson.start_at)}</strong>
      <small>
        {relativeDay(lesson.start_at, today)}
        {lesson.course_minutes ? t(` · ${lesson.course_minutes} 分钟`, ` · ${lesson.course_minutes} min`) : ""}
      </small>
      <span className={`pill ${lesson.status === "confirmed" ? "ok" : "warn"}`}>
        {lesson.status === "confirmed" ? t("已确认", "Confirmed") : t("待确认", "Pending")}
        {lesson.booking_type === "trial" ? t(" · 试听", " · trial") : lesson.booking_type === "practice" ? t(" · 练习课", " · practice") : ""}
      </span>
    </div>
  );
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days from today to a date, counting calendar days rather than hours. */
function daysUntil(value: string, today: Date) {
  const target = parseDay(value);
  if (!target) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function parseDay(value: string) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

/**
 * Months once the exam is more than a month out, days once it is closer.
 * 30.44 is the average month, so "2 个月" means roughly two months rather than
 * two lots of thirty days.
 */
function formatCountdown(value: string, today: Date) {
  const days = daysUntil(value, today);
  if (days === null) return tr("日期无效", "Invalid date");
  if (days < 0) return tr(`已过 ${Math.abs(days)} 天`, `${Math.abs(days)} d ago`);
  if (days === 0) return tr("就是今天", "Today");
  if (days <= 30) return tr(`还有 ${days} 天`, `${days} days`);
  return tr(`还有 ${Math.round(days / 30.44)} 个月`, `${Math.round(days / 30.44)} months`);
}

function examUrgencyClass(value: string, today: Date) {
  const days = daysUntil(value, today);
  if (days === null || days > 30) return "";
  if (days < 0) return "overview-exam-past";
  return "overview-exam-soon";
}

function addMonths(today: Date, months: number) {
  const target = new Date(today.getFullYear(), today.getMonth() + months, today.getDate());
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${month}-${day}`;
}

/** How long the student has been studying, counted from their registration. */
function formatDuration(value: string, today: Date) {
  const from = parseDay(value);
  if (!from) return "—";
  const days = Math.max(0, Math.round((today.getTime() - from.getTime()) / 86400000));
  if (days < 30) return tr(`${days} 天`, `${days} days`);

  let months = (today.getFullYear() - from.getFullYear()) * 12 + (today.getMonth() - from.getMonth());
  let anchor = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  if (anchor > today) {
    months -= 1;
    anchor = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  }
  const rest = Math.round((today.getTime() - anchor.getTime()) / 86400000);
  return rest > 0 ? tr(`${months} 个月 ${rest} 天`, `${months} mo ${rest} d`) : tr(`${months} 个月`, `${months} months`);
}

function formatDay(value?: string | null) {
  const date = value ? parseDay(value) : null;
  if (!date) return "—";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function formatLessonTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(tr("zh-CN", "en-GB"), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function relativeDay(value: string, today: Date) {
  const days = daysUntil(value, today);
  if (days === null) return "";
  if (days <= 0) return tr("今天", "Today");
  if (days === 1) return tr("明天", "Tomorrow");
  if (days < 7) return tr(`${days} 天后`, `in ${days} days`);
  return tr(`${Math.round(days / 7)} 周后`, `in ${Math.round(days / 7)} weeks`);
}
