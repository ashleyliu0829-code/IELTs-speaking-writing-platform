"use client";

import { useEffect, useState } from "react";
import type { LessonBooking, LessonSection, StudentProfile } from "@/lib/types";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * A student's lessons as one table, the way the teacher's spreadsheet had
 * them: one row per lesson, numbered, with what it covered, the slides used,
 * what was set afterwards, and a tick once it has been taught.
 *
 * Rows come from bookings, so nothing is typed twice: scheduling a lesson
 * (or recording a past one) on the scheduling page creates the row, and this
 * page fills in the rest. Lessons still ahead are listed below the taught
 * ones, greyed, so the plan and the record read as one sequence.
 */

const sectionOptions: LessonSection[] = ["Speaking", "Listening", "Reading", "Writing", "Mock", "Trial"];

export function sectionLabel(section: LessonSection) {
  const labels: Record<LessonSection, [string, string]> = {
    Speaking: ["口语", "Speaking"],
    Listening: ["听力", "Listening"],
    Reading: ["阅读", "Reading"],
    Writing: ["写作", "Writing"],
    Mock: ["模考", "Mock test"],
    Trial: ["试课", "Trial"]
  };
  return tr(...labels[section]);
}

export function LessonProgressPanel({ students }: { students: StudentProfile[] }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState("");
  const [lessons, setLessons] = useState<LessonBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setStatus("");
    (async () => {
      try {
        const response = await fetch(`/api/teacher/lesson-progress?studentName=${encodeURIComponent(selected)}`);
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || tr("无法加载课程进度。", "Could not load the lesson list."));
        setLessons(data.lessons || []);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : tr("无法加载课程进度。", "Could not load the lesson list."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function update(bookingId: string, patch: LessonPatch) {
    setStatus("");
    try {
      const response = await fetch("/api/teacher/lesson-progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, ...patch })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));
      setLessons((current) => current.map((lesson) => (lesson.id === bookingId ? { ...lesson, ...data.lesson } : lesson)));
      setEditingId(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("保存失败。", "Could not save."));
    }
  }

  /**
   * A new row lines up with the schedule rather than duplicating it: if a
   * booking for this student already covers the chosen time — the student
   * booked it, or the teacher scheduled it — the details go onto that
   * booking; otherwise a booking is created (a past time records a lesson
   * already taught) and the details go onto the new one.
   */
  async function addLesson(input: NewLessonInput) {
    setSaving(true);
    setStatus("");
    try {
      const startMs = new Date(input.startAt).getTime();
      const endMs = startMs + input.courseMinutes * 60 * 1000;
      const existing = lessons.find((lesson) => {
        const a = new Date(lesson.start_at).getTime();
        const b = new Date(lesson.end_at).getTime();
        return a < endMs && b > startMs;
      });

      let bookingId = existing?.id;
      if (!bookingId) {
        const student = students.find((item) => item.name === selected);
        const response = await fetch("/api/teacher/lesson-bookings?lessonType=regular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: selected,
            studentAccountId: student?.account_id || "",
            startAt: input.startAt,
            courseMinutes: input.courseMinutes,
            bookingType: input.bookingType,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || tr("无法新增课程。", "Could not add the lesson."));
        bookingId = data.booking.id as string;
      }

      const patch: LessonPatch = { topic: input.topic, material: input.material, sections: input.sections, note: input.note };
      const response = await fetch("/api/teacher/lesson-progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, ...patch })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));

      await reload();
      setAdding(false);
      setStatus(
        existing
          ? tr(`已对齐到课程表里 ${formatWhen(existing.start_at)} 的那节课。`, `Matched the lesson already on the schedule at ${formatWhen(existing.start_at)}.`)
          : tr("已加入课程表。", "Added to the schedule.")
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("无法新增课程。", "Could not add the lesson."));
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    const response = await fetch(`/api/teacher/lesson-progress?studentName=${encodeURIComponent(selected)}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) setLessons(data.lessons || []);
  }

  const now = Date.now();
  const taught = lessons.filter((lesson) => new Date(lesson.end_at).getTime() <= now);
  const ahead = lessons.filter((lesson) => new Date(lesson.end_at).getTime() > now);
  const done = taught.filter((lesson) => lesson.completed_at).length;
  const needle = search.trim().toLowerCase();
  const roster = needle ? students.filter((student) => student.name.toLowerCase().includes(needle)) : students;

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>{t("课程进度", "Lesson progress")}</h2>
        </div>
        <span className="pill">{t(`${students.length} 位学生`, `${students.length} students`)}</span>
      </div>

      <div className="student-profile-layout">
        <aside className="student-profile-sidebar">
          <input
            type="search"
            className="overview-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("搜索学生姓名", "Search by name")}
          />
          {roster.length ? (
            <div className="student-list">
              {roster.map((student) => (
                <button
                  className={`student-row ${student.name === selected ? "active" : ""}`}
                  key={student.id}
                  onClick={() => {
                    setSelected(student.name);
                    setEditingId(null);
                  }}
                  type="button"
                >
                  <strong>{student.name}</strong>
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">{t("没有匹配的学生。", "No matching students.")}</p>
          )}
        </aside>

        <div className="stack">
          {!selected && <p className="hint">{t("从左侧选择学生，查看和填写每节课的内容。", "Pick a student on the left to see and fill in each lesson.")}</p>}
          {status && <p className={/失败|无法|冲突|not|could/i.test(status) ? "error" : "hint"}>{status}</p>}
          {selected && (
            <>
              <div className="section-head compact">
                <div>
                  <h3>{selected}</h3>
                  <div className="hint">
                    {t(`已上 ${taught.length} 节，已完成 ${done} 节；待上 ${ahead.length} 节。`, `${taught.length} taught, ${done} ticked off; ${ahead.length} ahead.`)}
                  </div>
                </div>
                <button className="btn accent" type="button" onClick={() => setAdding((value) => !value)} disabled={saving}>
                  {adding ? t("收起", "Close") : t("新建课程", "New lesson")}
                </button>
              </div>

              {adding && <NewLessonForm saving={saving} onSubmit={addLesson} onCancel={() => setAdding(false)} />}

              {loading && !lessons.length ? (
                <p className="hint">{t("正在加载...", "Loading...")}</p>
              ) : !lessons.length ? (
                <p className="hint">{t("这个学生还没有课程记录。", "No lessons for this student yet.")}</p>
              ) : (
                <div className="overview-scroll">
                  <table className="overview-table lesson-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t("时间", "When")}</th>
                        <th>{t("板块", "Areas")}</th>
                        <th>{t("课题", "Topic")}</th>
                        <th>{t("课件", "Material")}</th>
                        <th>{t("作业 / 备注", "Homework / notes")}</th>
                        <th>{t("完成", "Done")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lessons.map((lesson, index) =>
                        editingId === lesson.id ? (
                          <LessonEditorRow
                            key={lesson.id}
                            index={index + 1}
                            lesson={lesson}
                            onSave={(patch) => update(lesson.id, patch)}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <tr className={`${new Date(lesson.end_at).getTime() > now ? "ahead" : ""} ${lesson.completed_at ? "completed" : ""}`} key={lesson.id}>
                            <td>{index + 1}</td>
                            <td>
                              <div className="overview-stack">
                                <strong>{formatWhen(lesson.start_at)}</strong>
                                <small>
                                  {lesson.course_minutes / 60} {t("小时", "h")}
                                  {studentLocal(lesson) ? ` · ${t("学生当地", "student")} ${studentLocal(lesson)}` : ""}
                                </small>
                              </div>
                            </td>
                            <td>
                              <div className="progress-pills">
                                {(lesson.lesson_sections || []).map((section) => (
                                  <span className="pill compact" key={section}>
                                    {sectionLabel(section)}
                                  </span>
                                ))}
                                {!(lesson.lesson_sections || []).length && <em className="hint">—</em>}
                              </div>
                            </td>
                            <td className="progress-text">{lesson.lesson_topic || <em className="hint">—</em>}</td>
                            <td className="progress-text">{lesson.lesson_material || <em className="hint">—</em>}</td>
                            <td className="progress-text">{lesson.lesson_note || <em className="hint">—</em>}</td>
                            <td>
                              <input
                                type="checkbox"
                                checked={Boolean(lesson.completed_at)}
                                onChange={(event) => update(lesson.id, { completed: event.target.checked })}
                                aria-label={t("标记已完成", "Mark done")}
                              />
                            </td>
                            <td className="overview-actions">
                              <button className="btn ghost" type="button" onClick={() => setEditingId(lesson.id)}>
                                {t("编辑", "Edit")}
                              </button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

type NewLessonInput = {
  startAt: string;
  courseMinutes: 60 | 120;
  bookingType: "trial" | "regular";
  topic: string;
  material: string;
  sections: LessonSection[];
  note: string;
};

function NewLessonForm({ saving, onSubmit, onCancel }: { saving: boolean; onSubmit: (input: NewLessonInput) => void; onCancel: () => void }) {
  const { t } = useLanguage();
  const [start, setStart] = useState("");
  const [kind, setKind] = useState<"trial" | "60" | "120">("60");
  const [topic, setTopic] = useState("");
  const [material, setMaterial] = useState("");
  const [sections, setSections] = useState<LessonSection[]>([]);
  const [note, setNote] = useState("");

  function toggle(section: LessonSection) {
    setSections((current) => (current.includes(section) ? current.filter((item) => item !== section) : [...current, section]));
  }

  return (
    <form
      className="progress-new"
      onSubmit={(event) => {
        event.preventDefault();
        const date = new Date(start);
        if (!start || Number.isNaN(date.getTime())) return;
        onSubmit({
          startAt: date.toISOString(),
          courseMinutes: kind === "120" ? 120 : 60,
          bookingType: kind === "trial" ? "trial" : "regular",
          topic,
          material,
          sections,
          note
        });
      }}
    >
      <div className="progress-new-row">
        <div>
          <label>{t("上课时间", "Lesson time")}</label>
          <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required />
        </div>
        <div>
          <label>{t("类型", "Type")}</label>
          <select value={kind} onChange={(event) => setKind(event.target.value as "trial" | "60" | "120")}>
            <option value="trial">{t("试课（1 小时）", "Trial (1 hour)")}</option>
            <option value="60">{t("正式课 1 小时", "Lesson, 1 hour")}</option>
            <option value="120">{t("正式课 2 小时", "Lesson, 2 hours")}</option>
          </select>
        </div>
      </div>
      <div className="progress-editor-sections">
        {sectionOptions.map((section) => (
          <label className="check-row plain" key={section}>
            <input type="checkbox" checked={sections.includes(section)} onChange={() => toggle(section)} />
            <span>{sectionLabel(section)}</span>
          </label>
        ))}
      </div>
      <div>
        <label>{t("课题", "Topic")}</label>
        <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} placeholder={t("这节课讲了 / 要讲什么", "What the lesson covers")} />
      </div>
      <div className="progress-new-row">
        <div>
          <label>{t("课件", "Material")}</label>
          <input value={material} onChange={(event) => setMaterial(event.target.value)} placeholder={t("例如：Speaking 1", "e.g. Speaking 1")} />
        </div>
        <div>
          <label>{t("作业 / 备注", "Homework / notes")}</label>
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
      <p className="hint">
        {t("时间与课程表对齐：这个时间学生已约或你已排的课会直接沿用，不会重复创建；没有的话会新加到课程表里。", "Lines up with the schedule: a lesson already booked or scheduled at this time is reused; otherwise one is added.")}
      </p>
      <div className="student-dialog-actions">
        <button className="btn secondary" type="button" onClick={onCancel} disabled={saving}>
          {t("取消", "Cancel")}
        </button>
        <button className="btn" type="submit" disabled={saving || !start}>
          {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
        </button>
      </div>
    </form>
  );
}

type LessonPatch = {
  topic?: string;
  material?: string;
  sections?: LessonSection[];
  note?: string;
  completed?: boolean;
};

function LessonEditorRow({
  index,
  lesson,
  onSave,
  onCancel
}: {
  index: number;
  lesson: LessonBooking;
  onSave: (patch: LessonPatch) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [topic, setTopic] = useState(lesson.lesson_topic || "");
  const [material, setMaterial] = useState(lesson.lesson_material || "");
  const [sections, setSections] = useState<LessonSection[]>(lesson.lesson_sections || []);
  const [note, setNote] = useState(lesson.lesson_note || "");

  function toggle(section: LessonSection) {
    setSections((current) => (current.includes(section) ? current.filter((item) => item !== section) : [...current, section]));
  }

  return (
    <tr className="editing">
      <td>{index}</td>
      <td>
        <strong>{formatWhen(lesson.start_at)}</strong>
      </td>
      <td colSpan={5}>
        <div className="progress-editor">
          <div className="progress-editor-sections">
            {sectionOptions.map((section) => (
              <label className="check-row plain" key={section}>
                <input type="checkbox" checked={sections.includes(section)} onChange={() => toggle(section)} />
                <span>{sectionLabel(section)}</span>
              </label>
            ))}
          </div>
          <div>
            <label>{t("课题", "Topic")}</label>
            <textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t("这节课讲了什么，例如：1) 作业回顾 2) 听力 P2+P3", "What the lesson covered")} rows={3} />
          </div>
          <div>
            <label>{t("课件", "Material")}</label>
            <input value={material} onChange={(event) => setMaterial(event.target.value)} placeholder={t("例如：Speaking 1", "e.g. Speaking 1")} />
          </div>
          <div>
            <label>{t("作业 / 备注", "Homework / notes")}</label>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("课后作业或备注", "Homework set, or anything to remember")} rows={2} />
          </div>
        </div>
      </td>
      <td className="overview-actions">
        <div className="stack">
          <button className="btn" type="button" onClick={() => onSave({ topic, material, sections, note })}>
            {t("保存", "Save")}
          </button>
          <button className="btn ghost" type="button" onClick={onCancel}>
            {t("取消", "Cancel")}
          </button>
        </div>
      </td>
    </tr>
  );
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The student's own clock, shown only when it differs from the teacher's.
function studentLocal(lesson: LessonBooking) {
  const zone = lesson.student_timezone;
  if (!zone) return "";
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === local) return "";
    return new Intl.DateTimeFormat("zh-CN", { timeZone: zone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(lesson.start_at));
  } catch {
    return "";
  }
}
