"use client";

import { useEffect, useMemo, useState } from "react";
import { coursePlanAreas, coursePlanFamily } from "@/lib/coursePlans";
import { StudentDailyCheckinTile } from "@/components/DailyTasks";
import { LearningProgressPanel } from "@/components/LearningProgress";
import { SpeakingTopicProgressPanel } from "@/components/SpeakingTopicProgress";
import type { Submission } from "@/lib/types";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * The student's home: what changed, when the next lesson is, when the exam
 * is, and how they are doing.
 *
 * The notifications and the submissions are built by the portal from data it
 * already holds; the lesson and the exam come from /api/student/home. The
 * exam date is the one thing here the student can change themselves — the
 * teacher sees the same row, so setting it here sets it for them too.
 *
 * Which curves show depends on the course plan: a single-skill plan shows
 * only its skill, everything else shows both.
 */

export type StudentNotice = {
  id: string;
  title: string;
  message: string;
  href: string;
  tone: "assigned" | "reviewed" | "notice";
};

type HomeLesson = {
  id: string;
  start_at: string;
  end_at: string;
  status: "pending" | "confirmed";
  booking_type: string;
  course_minutes: number;
};

type HomeData = {
  lessons: HomeLesson[];
  exam_date: string | null;
  exam_date_confirmed: boolean;
  course_plan: string;
};

const monthOptions = [1, 2, 3, 6, 12];

export function StudentHomePanels({
  notifications,
  speakingSubmissions,
  writingSubmissions,
  completedP1TopicIds,
  completedP2TopicIds,
  onPracticeTopic,
  practiceLoadingId,
  practiceMessage,
  onOpenSchedule,
  onOpenDailyTasks
}: {
  notifications: StudentNotice[];
  speakingSubmissions: Submission[];
  writingSubmissions: Submission[];
  completedP1TopicIds: string[];
  completedP2TopicIds: string[];
  onPracticeTopic: (part: "p1" | "p2", topicId: string) => void;
  practiceLoadingId: string;
  practiceMessage: string;
  onOpenSchedule: () => void;
  onOpenDailyTasks: () => void;
}) {
  const [data, setData] = useState<HomeData | null>(null);
  const [status, setStatus] = useState("");
  const [editingExam, setEditingExam] = useState(false);
  const [savingExam, setSavingExam] = useState(false);
  const today = useMemo(() => startOfDay(new Date()), []);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/student/home");
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(body.error || tr("主页加载失败。", "Could not load the home page."));
        setData(body);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : tr("主页加载失败。", "Could not load the home page."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveExam(examDate: string | null, confirmed: boolean) {
    setSavingExam(true);
    try {
      const response = await fetch("/api/student/home", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examDate, confirmed })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || tr("考试日期保存失败。", "Could not save the exam date."));
      setData((current) =>
        current ? { ...current, exam_date: body.exam_date ?? null, exam_date_confirmed: Boolean(body.exam_date_confirmed) } : current
      );
      setEditingExam(false);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("考试日期保存失败。", "Could not save the exam date."));
    } finally {
      setSavingExam(false);
    }
  }

  const next = data?.lessons[0] || null;
  const assigned = notifications.filter((n) => n.tone === "assigned").length;
  const reviewed = notifications.filter((n) => n.tone === "reviewed").length;
  const areas = coursePlanAreas(data?.course_plan || "");
  const showSpeaking = areas.includes("speaking");
  const showWriting = areas.includes("writing");

  return (
    <div className="home-panels student-home">
      <div className="student-home-row three">
        <article className="card stack student-home-tile">
          <div className="section-head compact">
            <div>
              <h2>{t("下次上课", "Next lesson")}</h2>
            </div>
            <button className="btn secondary" type="button" onClick={onOpenSchedule}>
              {t("去预约", "Book")}
            </button>
          </div>
          {status && <p className="error">{status}</p>}
          {data && !next && <p className="hint">{t("还没有预约的课。", "No lesson booked yet.")}</p>}
          {next && (
            <div className="student-home-lesson">
              <strong>{formatLessonStamp(next.start_at)}</strong>
              <span>
                {relativeDay(next.start_at, today)}
                {next.course_minutes ? t(` · ${next.course_minutes} 分钟`, ` · ${next.course_minutes} min`) : ""}
                {next.booking_type === "trial" ? t(" · 试听", " · trial") : ""}
              </span>
              <span className={`pill ${next.status === "confirmed" ? "ok" : "warn"}`}>
                {next.status === "confirmed" ? t("老师已确认", "Confirmed by teacher") : t("等老师确认", "Awaiting teacher")}
              </span>
            </div>
          )}
          {data && data.lessons.length > 1 && (
            <ul className="student-home-more">
              {data.lessons.slice(1).map((lesson) => (
                <li key={lesson.id}>
                  {formatLessonStamp(lesson.start_at)}
                  <small>{lesson.status === "confirmed" ? t("已确认", "Confirmed") : t("待确认", "Pending")}</small>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card stack student-home-tile">
          <div className="section-head compact">
            <div>
              <h2>{t("距离考试还有", "Time to the exam")}</h2>
              {data?.course_plan ? (
                <div className="student-home-plan">
                  <span className="hint">{t("课程计划", "Course plan")}</span>
                  <span className={`pill plan ${coursePlanFamily(data.course_plan) || ""}`}>{data.course_plan}</span>
                </div>
              ) : (
                <div className="hint">{t("定了考试日期可以填在这里，老师也会看到。", "Once your exam is booked, put the date here — your teacher sees it too.")}</div>
              )}
            </div>
            {data && !editingExam && (
              <button className="btn secondary" type="button" onClick={() => setEditingExam(true)}>
                {data.exam_date ? t("修改", "Edit") : t("设置", "Set")}
              </button>
            )}
          </div>

          {data && !editingExam && !data.exam_date && <p className="hint">{t("考试日期还没定。", "No exam date yet.")}</p>}
          {data && !editingExam && data.exam_date && (
            <div className="student-home-exam">
              <strong className={`student-home-countdown ${examUrgencyClass(data.exam_date, today)}`}>
                {formatCountdown(data.exam_date, today)}
              </strong>
              <span>
                {data.exam_date_confirmed ? t("考试日 ", "Exam day ") : t("预计 ", "Estimated ")}
                {formatDay(data.exam_date)}
              </span>
            </div>
          )}
          {data && editingExam && (
            <ExamEditor
              initialDate={data.exam_date || ""}
              initialConfirmed={data.exam_date_confirmed}
              today={today}
              saving={savingExam}
              onSave={saveExam}
              onCancel={() => setEditingExam(false)}
            />
          )}
        </article>

        <StudentDailyCheckinTile onOpenAll={onOpenDailyTasks} />
      </div>

      <article className="card stack">
        <div className="section-head compact">
          <div>
            <h2>{t("最近通知", "Latest")}</h2>
          </div>
          <span className="pill">{notifications.length}</span>
        </div>
        {notifications.length ? (
          <>
            <div className="student-notification-summary">
              <span className="pill warn">{t(`${assigned} 项新作业`, `${assigned} new homework`)}</span>
              <span className="pill ok">{t(`${reviewed} 项反馈`, `${reviewed} feedback`)}</span>
            </div>
            <div className="student-notification-list">
              {notifications.map((notice) => (
                notice.tone === "notice" ? (
                  <div className="student-notification-item notice" key={notice.id}>
                    <strong>{notice.title}</strong>
                    <span>{notice.message}</span>
                  </div>
                ) : (
                <a className={`student-notification-item ${notice.tone}`} href={notice.href} key={notice.id}>
                  <strong>{notice.title}</strong>
                  <span>{notice.message}</span>
                </a>
                )
              ))}
            </div>
          </>
        ) : (
          <p className="hint">{t("暂时没有新通知。", "Nothing new right now.")}</p>
        )}
      </article>

      {/* The speaking curve and the topic board are read together — how the
          scores move, and which topics have been covered — so they share a
          row. Writing has no topic board and takes the full width. */}
      {showSpeaking && (
        <div className="student-home-row loose">
          <LearningProgressPanel title={t("口语学习情况", "Speaking progress")} submissions={speakingSubmissions} />
          <SpeakingTopicProgressPanel
            submissions={speakingSubmissions}
            completedP1TopicIds={completedP1TopicIds}
            completedP2TopicIds={completedP2TopicIds}
            onPracticeTopic={onPracticeTopic}
            practiceLoadingId={practiceLoadingId}
            practiceMessage={practiceMessage}
          />
        </div>
      )}
      {showWriting && <LearningProgressPanel title={t("写作学习情况", "Writing progress")} submissions={writingSubmissions} />}
      {data && !showSpeaking && !showWriting && (
        <p className="hint">{t("你的课程计划不含口语和写作，所以这里没有进度曲线。", "Your course plan has no speaking or writing, so there is no progress curve here.")}</p>
      )}
    </div>
  );
}

/** The same controls the teacher has, on the student's own tile. */
function ExamEditor({
  initialDate,
  initialConfirmed,
  today,
  saving,
  onSave,
  onCancel
}: {
  initialDate: string;
  initialConfirmed: boolean;
  today: Date;
  saving: boolean;
  onSave: (examDate: string | null, confirmed: boolean) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const { t } = useLanguage();

  return (
    <div className="student-dialog-field">
      <label>{t("考试日期", "Exam date")}</label>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <label className="check-row plain">
        <input type="checkbox" checked={confirmed} disabled={!date} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>{t("日期已确定", "Date confirmed")}</span>
        <small>{t("还没报名就不勾，当作预估", "Leave unticked if not booked yet — treated as an estimate")}</small>
      </label>
      <div className="overview-month-row">
        {monthOptions.map((months) => (
          <button
            className="btn ghost"
            key={months}
            type="button"
            onClick={() => {
              setDate(addMonths(today, months));
              setConfirmed(false);
            }}
          >
            {t(`${months} 个月后`, `in ${months} mo`)}
          </button>
        ))}
        {date && (
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setDate("");
              setConfirmed(false);
            }}
          >
            {t("清除", "Clear")}
          </button>
        )}
      </div>
      <div className="student-dialog-actions">
        <button className="btn secondary" type="button" disabled={saving} onClick={onCancel}>
          {t("取消", "Cancel")}
        </button>
        <button className="btn" type="button" disabled={saving} onClick={() => onSave(date || null, date ? confirmed : false)}>
          {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
        </button>
      </div>
    </div>
  );
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDay(value: string) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function daysUntil(value: string, today: Date) {
  const target = parseDay(value);
  if (!target) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatCountdown(value: string, today: Date) {
  const days = daysUntil(value, today);
  if (days === null) return tr("日期无效", "Invalid date");
  if (days < 0) return tr(`已过 ${Math.abs(days)} 天`, `${Math.abs(days)} d ago`);
  if (days === 0) return tr("就是今天", "Today");
  if (days <= 30) return tr(`${days} 天`, `${days} days`);
  return tr(`${Math.round(days / 30.44)} 个月`, `${Math.round(days / 30.44)} months`);
}

function examUrgencyClass(value: string, today: Date) {
  const days = daysUntil(value, today);
  if (days === null || days > 30) return "";
  if (days < 0) return "overview-exam-past";
  return "overview-exam-soon";
}

function addMonths(today: Date, months: number) {
  const target = new Date(today.getFullYear(), today.getMonth() + months, today.getDate());
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

function formatDay(value: string) {
  const date = parseDay(value);
  if (!date) return "—";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatLessonStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const weekday = tr(["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]);
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return tr(`${date.getMonth() + 1}月${date.getDate()}日 ${weekday} ${clock}`, `${weekday} ${date.getDate()}/${date.getMonth() + 1} ${clock}`);
}

function relativeDay(value: string, today: Date) {
  const days = daysUntil(value, today);
  if (days === null) return "";
  if (days <= 0) return tr("今天", "Today");
  if (days === 1) return tr("明天", "Tomorrow");
  if (days < 7) return tr(`${days} 天后`, `in ${days} days`);
  return tr(`${Math.round(days / 7)} 周后`, `in ${Math.round(days / 7)} weeks`);
}
