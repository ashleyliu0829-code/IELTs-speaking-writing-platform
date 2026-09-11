"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeacherHomeActivity, TeacherHomeLesson } from "@/lib/types";
import { tr, useLanguage } from "@/lib/i18n";
import { TeacherTodoPanel } from "@/components/TeacherTodos";
import { activeAnnouncements } from "@/lib/announcements";
import { sectionLabel } from "@/components/LessonProgress";

/**
 * The teacher's home page once the workspaces moved into the sidebar: what is
 * being taught next, and what the students have been up to.
 *
 * The lessons and activity panels are read-only on purpose. Everything there
 * has a place it can be acted on — the scheduling page, the grading page — and
 * duplicating those controls would mean two versions of the same interaction
 * to keep in step. The to-do list is the exception: it lives only here.
 */

export function TeacherHomePanels({
  onOpenSchedule,
  onOpenGrading
}: {
  onOpenSchedule?: () => void;
  onOpenGrading?: () => void;
}) {
  const [lessons, setLessons] = useState<TeacherHomeLesson[]>([]);
  const [activity, setActivity] = useState<TeacherHomeActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const now = useMemo(() => new Date(), []);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/teacher/home");
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || tr("首页数据加载失败。", "Could not load the home page."));
        setLessons(data.lessons || []);
        setActivity(data.activity || []);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : tr("首页数据加载失败。", "Could not load the home page."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(() => groupByDay(lessons), [lessons]);
  const notices = useMemo(() => activeAnnouncements(now), [now]);

  return (
    <div className="home-panels">
      <div className="home-row">
      <article className="card stack">
        <div className="section-head compact">
          <div>
            <h2>{t("课程安排", "Lessons")}</h2>
          </div>
          {onOpenSchedule && (
            <button className="btn secondary" type="button" onClick={onOpenSchedule}>
              {t("去排课", "Schedule")}
            </button>
          )}
        </div>

        {status && <p className="error">{status}</p>}
        {loading && !lessons.length && <p className="hint">{t("正在加载...", "Loading...")}</p>}
        {!loading && !lessons.length && !status && <p className="hint">{t("接下来没有排课。", "No lessons coming up.")}</p>}

        {days.map((day) => (
          <div className="home-lesson-day" key={day.key}>
            <div className="home-lesson-date">
              <strong>{day.label}</strong>
              <small>{day.weekday}</small>
            </div>
            <div className="home-lesson-list">
              {day.lessons.map((lesson) => (
                <div className={`home-lesson ${lesson.status}`} key={lesson.id}>
                  <span className="home-lesson-time">{formatClock(lesson.start_at)}</span>
                  <span className="home-lesson-student">{lesson.student_name}</span>
                  <span className="home-lesson-meta">
                    {lesson.course_minutes ? t(`${lesson.course_minutes} 分钟`, `${lesson.course_minutes} min`) : ""}
                    {lessonTypeLabel(lesson.booking_type)}
                  </span>
                  {/* Always rendered so the status pill keeps its column. */}
                  <span className="home-lesson-sections" title={lesson.topic || undefined}>
                    {lesson.sections.map((section) => (
                      <span className="pill compact" key={section}>
                        {sectionLabel(section)}
                      </span>
                    ))}
                  </span>
                  <span className={`pill ${lesson.status === "confirmed" ? "ok" : "warn"}`}>
                    {lesson.status === "confirmed" ? t("已确认", "Confirmed") : t("待确认", "Pending")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </article>
      <TeacherTodoPanel />
      </div>

      <article className="card stack">
        <div className="section-head compact">
          <div>
            <h2>{t("最新动态", "Latest activity")}</h2>
          </div>
          {onOpenGrading && (
            <button className="btn secondary" type="button" onClick={onOpenGrading}>
              {t("去批改", "Grade")}
            </button>
          )}
        </div>

        {loading && !activity.length && !notices.length && <p className="hint">{t("正在加载...", "Loading...")}</p>}
        {!loading && !activity.length && !notices.length && !status && <p className="hint">{t("最近 30 天没有新动态。", "Nothing in the last 30 days.")}</p>}

        <div className="home-feed">
          {notices.map((notice) => (
            <div className="home-feed-row" key={notice.id}>
              <span className="home-feed-dot notice" aria-hidden="true" />
              <div className="home-feed-body">
                <p>
                  <strong>{t("平台公告", "Notice")}</strong> · {t(notice.zh, notice.en)}
                </p>
                <small>{relativeTime(notice.at, now)}</small>
              </div>
            </div>
          ))}
          {activity.map((item) => (
            <div className="home-feed-row" key={item.id}>
              <span className={`home-feed-dot ${item.kind}`} aria-hidden="true" />
              <div className="home-feed-body">
                <p>{describe(item)}</p>
                <small>{relativeTime(item.at, now)}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function describe(item: TeacherHomeActivity) {
  const who = <strong>{item.student_name}</strong>;
  if (item.kind === "submission") {
    return (
      <>
        {who}{tr(` 提交了${item.area === "writing" ? "写作" : "口语"}作业《${item.title}》`, ` submitted ${item.area === "writing" ? "writing" : "speaking"} homework "${item.title}"`)}
      </>
    );
  }
  if (item.kind === "booking_pending") {
    return (
      <>
        {who}{tr(` 预约了 ${formatLessonStamp(item.lesson_at)} 的课程，等你确认`, ` booked a lesson for ${formatLessonStamp(item.lesson_at)} — awaiting your confirmation`)}
      </>
    );
  }
  if (item.kind === "booking_confirmed") {
    return (
      <>
        {who}{tr(` 的课程已排定：${formatLessonStamp(item.lesson_at)}`, `'s lesson is set for ${formatLessonStamp(item.lesson_at)}`)}
        {lessonTypeLabel(item.booking_type)}
      </>
    );
  }
  if (item.kind === "booking_cancelled") {
    return (
      <>
        {who}{tr(` 取消了 ${formatLessonStamp(item.lesson_at)} 的课程`, ` cancelled the lesson on ${formatLessonStamp(item.lesson_at)}`)}
      </>
    );
  }
  return <>{who}{tr(" 注册了学生账号", " signed up")}</>;
}

function lessonTypeLabel(bookingType?: string) {
  if (bookingType === "trial") return tr(" · 试听", " · trial");
  if (bookingType === "practice") return tr(" · 练习课", " · practice");
  return "";
}

function groupByDay(lessons: TeacherHomeLesson[]) {
  const days: Array<{ key: string; label: string; weekday: string; lessons: TeacherHomeLesson[] }> = [];
  lessons.forEach((lesson) => {
    const date = new Date(lesson.start_at);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const existing = days.find((day) => day.key === key);
    if (existing) {
      existing.lessons.push(lesson);
      return;
    }
    days.push({
      key,
      label: tr(`${date.getMonth() + 1}月${date.getDate()}日`, `${date.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]}`),
      weekday: tr(["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]),
      lessons: [lesson]
    });
  });
  return days;
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatLessonStamp(value?: string) {
  if (!value) return tr("某个时段", "a slot");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return tr(`${date.getMonth() + 1}月${date.getDate()}日 ${formatClock(value)}`, `${date.getDate()}/${date.getMonth() + 1} ${formatClock(value)}`);
}

function relativeTime(value: string, now: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return tr("刚刚", "just now");
  if (minutes < 60) return tr(`${minutes} 分钟前`, `${minutes} min ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tr(`${hours} 小时前`, `${hours} h ago`);
  const days = Math.round(hours / 24);
  if (days < 30) return tr(`${days} 天前`, `${days} d ago`);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
