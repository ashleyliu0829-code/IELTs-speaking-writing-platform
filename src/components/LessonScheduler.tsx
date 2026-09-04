"use client";

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { bookingTypeLabel, reservedMinutesFor, type BookingType } from "@/lib/lessonBooking";
import type { LessonBooking, LessonSlot } from "@/lib/types";

const timeZones = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Ho_Chi_Minh",
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Australia/Sydney"
];

const dayNames = {
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
};
const startHour = 7;
const endHour = 23;
const hourHeight = 56;

type BookingChoice = 60 | 120;
type LessonType = "regular" | "practice";
type ScheduleLanguage = "zh" | "en";
type LessonChoice = {
  slotId: string;
  startAt: string;
  courseMinutes: BookingChoice;
  bookingType: "trial" | "regular";
};

export function TeacherSchedulePanel({ token, lessonType = "regular", language = "zh", title, hint }: { token: string; lessonType?: LessonType; language?: ScheduleLanguage; title?: string; hint?: string }) {
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [timezone, setTimezone] = useState(defaultTimeZone());
  const [weekStart, setWeekStart] = useState(() => weekStartKey(todayDateKey(defaultTimeZone())));
  const [selectionStart, setSelectionStart] = useState("");
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [note, setNote] = useState("");
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // Scheduling a lesson directly, rather than waiting for a student to ask.
  const [rosterStudents, setRosterStudents] = useState<Array<{ name: string; account_id?: string | null }>>([]);
  const [lessonStudent, setLessonStudent] = useState("");
  const [lessonStart, setLessonStart] = useState("");
  const [lessonMinutes, setLessonMinutes] = useState<60 | 120>(60);
  const [lessonKind, setLessonKind] = useState<"trial" | "regular">("regular");

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);

  useEffect(() => {
    setWeekStart(weekStartKey(todayDateKey(timezone)));
  }, [timezone]);

  useEffect(() => {
    void loadSlots();
    void loadRoster();
  }, []);

  // Assistants have no student roster endpoint, so this is allowed to come back
  // empty; the picker falls back to a free-text name.
  async function loadRoster() {
    try {
      const data = await api("/api/teacher/students");
      setRosterStudents(
        ((data.students || []) as Array<{ name: string; account_id?: string | null }>).map((student) => ({
          name: student.name,
          account_id: student.account_id
        }))
      );
    } catch {
      setRosterStudents([]);
    }
  }

  async function api(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init.headers || {}) as Record<string, string>)
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...init, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败。");
    return data;
  }

  async function loadSlots() {
    setLoading(true);
    setMessage("");
    try {
      const data = await api(`/api/teacher/lesson-slots?lessonType=${lessonType}`);
      setSlots(data.slots || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("无法加载课程安排。", "Could not load the schedule."));
    } finally {
      setLoading(false);
    }
  }

  function selectCalendarTime(dateTimeValue: string) {
    if (!selectionStart) {
      setSelectionStart(dateTimeValue);
      setStartValue(dateTimeValue);
      setEndValue(addLocalMinutes(dateTimeValue, 90));
      setMessage(t("请在日历上选择结束时间，或在下方手动调整。", "Please choose the end time on the calendar, or adjust it below."));
      return;
    }

    const startUtc = new Date(localDateTimeToUtc(selectionStart, timezone)).getTime();
    const clickedUtc = new Date(localDateTimeToUtc(dateTimeValue, timezone)).getTime();
    if (clickedUtc <= startUtc) {
      setSelectionStart(dateTimeValue);
      setStartValue(dateTimeValue);
      setEndValue(addLocalMinutes(dateTimeValue, 90));
      return;
    }

    setStartValue(selectionStart);
    setEndValue(dateTimeValue);
    setSelectionStart("");
    setMessage(t("已选择可预约时间段，确认后请保存。", "Available time selected. Save it when ready."));
  }

  async function createSlot() {
    if (!startValue || !endValue) {
      setMessage(t("请选择开始时间和结束时间。", "Please choose a start and end time."));
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      await api(`/api/teacher/lesson-slots?lessonType=${lessonType}`, {
        method: "POST",
        body: JSON.stringify({
          startAt: localDateTimeToUtc(startValue, timezone),
          endAt: localDateTimeToUtc(endValue, timezone),
          timezone,
          note
        })
      });
      setSelectionStart("");
      setStartValue("");
      setEndValue("");
      setNote("");
      await loadSlots();
      setMessage(t("可预约上课时间已添加。", "Available lesson time added."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("无法添加时间。", "Could not add the time."));
    } finally {
      setLoading(false);
    }
  }

  async function deleteSlot(slotId: string) {
    setLoading(true);
    setMessage("");
    try {
      await api(`/api/teacher/lesson-slots?lessonType=${lessonType}&slotId=${slotId}`, { method: "DELETE" });
      await loadSlots();
      setMessage(t("时间段已删除。", "Time slot deleted."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("无法删除时间段。", "Could not delete the time slot."));
    } finally {
      setLoading(false);
    }
  }

  async function scheduleLesson() {
    if (!lessonStudent.trim() || !lessonStart) {
      setMessage(t("请选择学生和上课时间。", "Please choose a student and a start time."));
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const matched = rosterStudents.find((student) => student.name === lessonStudent.trim());
      await api(`/api/teacher/lesson-bookings?lessonType=${lessonType}`, {
        method: "POST",
        body: JSON.stringify({
          studentName: lessonStudent.trim(),
          studentAccountId: matched?.account_id || "",
          startAt: localDateTimeToUtc(lessonStart, timezone),
          courseMinutes: lessonMinutes,
          bookingType: lessonKind,
          timezone
        })
      });
      setLessonStudent("");
      setLessonStart("");
      await loadSlots();
      setMessage(t("课程已加入课表，该时间段对其他学生显示为已占用。", "Lesson added. That time now shows as taken to other students."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("无法新增课程。", "Could not add the lesson."));
    } finally {
      setLoading(false);
    }
  }

  async function updateBooking(bookingId: string, action: "confirm" | "cancel") {
    setLoading(true);
    setMessage("");
    try {
      await api(`/api/teacher/lesson-slots?lessonType=${lessonType}`, {
        method: "PATCH",
        body: JSON.stringify({
          bookingId,
          action,
          teacherSuggestedTime: suggestions[bookingId] ? localDateTimeToUtc(suggestions[bookingId], timezone) : ""
        })
      });
      await loadSlots();
      setMessage(action === "confirm" ? t("课程已确认。", "Lesson confirmed.") : t("课程已取消，并已附上建议时间。", "Lesson cancelled with a suggested new time."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("无法更新预约。", "Could not update the booking."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="card stack">
      <ScheduleHeader
        title={title || t("课程排课", "Lesson scheduling")}
        hint={hint || t("请先点击开始时间，再点击结束时间。学生会按照自己的时区看到这些可预约时间段。", "Click a start time, then an end time. Students will see these available times in their own timezone.")}
        language={language}
        timezone={timezone}
        weekStart={weekStart}
        loading={loading}
        setTimezone={setTimezone}
        setWeekStart={setWeekStart}
        onRefresh={loadSlots}
      />

      <div className="schedule-layout">
      <CalendarWeek
        days={days}
        timezone={timezone}
        language={language}
        slots={slots}
        selectedSlotIds={[]}
        onEmptyClick={selectCalendarTime}
        onSlotClick={() => null}
        renderEventAction={(slot) => {
          const activeCount = activeBookings(slot).length;
          return activeCount ? (
            <span>{activeCount} {t("个预约", "bookings")}</span>
          ) : (
            <button className="calendar-event-link" disabled={loading} onClick={() => deleteSlot(slot.id)} type="button">
              {t("删除", "Delete")}
            </button>
          );
        }}
      />

      <aside className="schedule-side">
      <div className="schedule-side-block">
        <label>{t("添加可预约时间", "Add available time")}</label>
        <div className="hint">
          {t("发布一段空闲时间，学生可以在其中发起预约。", "Publish a window students can request a lesson in.")}
        </div>
        <div>
          <label>{t("开始时间", "Start time")}</label>
          <input type="datetime-local" value={startValue} onChange={(event) => setStartValue(event.target.value)} />
        </div>
        <div>
          <label>{t("结束时间", "End time")}</label>
          <input type="datetime-local" value={endValue} onChange={(event) => setEndValue(event.target.value)} />
        </div>
        <div>
          <label>{t("备注", "Note")}</label>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("可选", "Optional")} />
        </div>
        <button className="btn" disabled={loading || !startValue || !endValue} onClick={createSlot} type="button">
          {t("添加可预约时间", "Add available time")}
        </button>
      </div>

      <div className="schedule-side-block">
        <label>{t("直接新增课程", "Add a lesson directly")}</label>
        <div className="hint">
          {t(
            "为某个学生排一节课，不需要等他发起预约。加入后这个时间对其他学生显示为已占用。",
            "Schedule a lesson for a student without waiting for a request. The time then shows as taken to everyone else."
          )}
        </div>
          <div>
            <label>{t("学生", "Student")}</label>
            <input
              list="schedule-roster"
              value={lessonStudent}
              onChange={(event) => setLessonStudent(event.target.value)}
              placeholder={t("选择或输入学生姓名", "Pick or type a student name")}
            />
            <datalist id="schedule-roster">
              {rosterStudents.map((student) => (
                <option key={student.name} value={student.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label>{t("上课时间", "Lesson time")}</label>
            <input type="datetime-local" value={lessonStart} onChange={(event) => setLessonStart(event.target.value)} />
          </div>
          <div>
            <label>{t("类型", "Type")}</label>
            <select
              value={lessonKind === "trial" ? "trial" : String(lessonMinutes)}
              onChange={(event) => {
                const value = event.target.value;
                setLessonKind(value === "trial" ? "trial" : "regular");
                setLessonMinutes(value === "120" ? 120 : 60);
              }}
              disabled={lessonType === "practice"}
            >
              <option value="trial">{t("试课（预留 1 小时）", "Trial (1 hour reserved)")}</option>
              <option value="60">{t("正式课 1 小时（预留 1.5 小时）", "Lesson, 1 hour (1.5 hours reserved)")}</option>
              <option value="120">{t("正式课 2 小时（预留 2.5 小时）", "Lesson, 2 hours (2.5 hours reserved)")}</option>
            </select>
          </div>
          <button className="btn" disabled={loading || !lessonStudent.trim() || !lessonStart} onClick={scheduleLesson} type="button">
            {t("加入课表", "Add to schedule")}
          </button>
      </div>
      </aside>
      </div>

      {message && <p className={message.includes("Could") || message.includes("Please") ? "error" : "hint"}>{message}</p>}

      <TeacherBookingList
        bookings={slots.flatMap((slot) => slot.bookings || [])}
        timezone={timezone}
        language={language}
        suggestions={suggestions}
        loading={loading}
        setSuggestions={setSuggestions}
        onUpdate={updateBooking}
      />
    </article>
  );
}

export function StudentSchedulePanel({ account, lessonType = "regular", assistantId = "", title = "课程预约", hint = "绿色时间段可以预约，灰色时间段已被预约。一次最多选择 5 节课。" }: { account?: { id: string; role: string; display_name: string } | null; lessonType?: LessonType; assistantId?: string; title?: string; hint?: string }) {
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [myBookings, setMyBookings] = useState<LessonBooking[]>([]);
  const [timezone, setTimezone] = useState(defaultTimeZone());
  const [weekStart, setWeekStart] = useState(() => weekStartKey(todayDateKey(defaultTimeZone())));
  const [choices, setChoices] = useState<Record<string, LessonChoice>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const selectedIds = useMemo(() => Object.keys(choices), [choices]);
  const groupedMyBookings = useMemo(() => splitBookingsByTime(myBookings), [myBookings]);

  useEffect(() => {
    setWeekStart(weekStartKey(todayDateKey(timezone)));
  }, [timezone]);

  useEffect(() => {
    void loadSchedule();
  }, [assistantId, lessonType]);

  async function loadSchedule() {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ lessonType });
      if (assistantId) params.set("assistantId", assistantId);
      const response = await fetch(`/api/student/lesson-bookings?${params.toString()}`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "无法加载课程安排。");
      setSlots(data.slots || []);
      setMyBookings(data.myBookings || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载课程安排。");
    } finally {
      setLoading(false);
    }
  }

  function toggleSlot(slot: LessonSlot, startAt = slot.start_at) {
    const choiceKey = `${slot.id}-${startAt}`;
    setChoices((current) => {
      if (current[choiceKey]) {
        const next = { ...current };
        delete next[choiceKey];
        return next;
      }
      if (Object.keys(current).length >= 5) {
        setMessage("一次最多选择 5 节课。");
        return current;
      }
      if (!canBookLesson(slot, startAt, 60, lessonType)) {
        setMessage("这个开始时间没有足够空间预约 1 小时课程。");
        return current;
      }
      return {
        ...current,
        [choiceKey]: {
          slotId: slot.id,
          startAt,
          courseMinutes: 60,
          bookingType: "regular"
        }
      };
    });
  }

  async function bookSelected() {
    if (!selectedIds.length) {
      setMessage("请至少选择一个上课时间。");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/student/lesson-bookings?lessonType=${lessonType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone,
          assistantId,
          bookings: selectedIds.map((choiceKey) => ({
            slotId: choices[choiceKey].slotId,
            startAt: choices[choiceKey].startAt,
            courseMinutes: choices[choiceKey].courseMinutes,
            bookingType: choices[choiceKey].bookingType
          }))
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "预约失败。");
      setChoices({});
      await loadSchedule();
      setMessage("预约请求已发送，请等待老师确认。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "预约失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="card stack">
      <ScheduleHeader
        title={title}
        hint={hint}
        timezone={timezone}
        weekStart={weekStart}
        loading={loading}
        setTimezone={setTimezone}
        setWeekStart={setWeekStart}
        onRefresh={loadSchedule}
        language="zh"
      />

      <div className="section-head compact">
        <span className="pill">已选 {selectedIds.length}/5</span>
        <button className="btn" disabled={loading || !selectedIds.length} onClick={bookSelected} type="button">
          提交预约
        </button>
      </div>

      <CalendarWeek
        days={days}
        timezone={timezone}
        language="zh"
        slots={slots}
        selectedSlotIds={selectedIds}
        onEmptyClick={() => null}
        onSlotClick={toggleSlot}
        renderEventAction={(slot) => {
          return <span>点击开始时间</span>;
        }}
      />

      {selectedIds.length > 0 && (
        <div className="selected-lessons">
          {selectedIds.map((choiceKey) => {
            const choice = choices[choiceKey];
            const slot = slots.find((item) => item.id === choice.slotId);
            if (!slot) return null;
            return (
              <div className="selected-lesson-row" key={choiceKey}>
                <strong>
                  {formatRange(
                    choice.startAt,
                    bookingEndAt(choice.startAt, choice.courseMinutes, lessonType, choice.bookingType),
                    timezone
                  )}
                </strong>
                <select
                  value={choice.bookingType === "trial" ? "trial" : String(choice.courseMinutes)}
                  disabled={lessonType === "practice"}
                  onChange={(event) => {
                    const value = event.target.value;
                    const bookingType = value === "trial" ? "trial" : "regular";
                    const courseMinutes = (value === "120" ? 120 : 60) as BookingChoice;
                    if (!canBookLesson(slot, choice.startAt, courseMinutes, lessonType, bookingType)) {
                      setMessage("这个开始时间没有足够空间安排该课程时长。");
                      return;
                    }
                    setChoices((current) => ({
                      ...current,
                      [choiceKey]: { ...choice, courseMinutes, bookingType }
                    }));
                  }}
                >
                  {lessonType === "practice" ? (
                    <option value="60">1 小时练习课</option>
                  ) : (
                    <>
                      {canBookLesson(slot, choice.startAt, 60, lessonType, "trial") && <option value="trial">试课，预留 1 小时</option>}
                      <option value="60">正式课 1 小时，预留 1.5 小时</option>
                      {canBookLesson(slot, choice.startAt, 120, lessonType) && <option value="120">正式课 2 小时，预留 2.5 小时</option>}
                    </>
                  )}
                </select>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() =>
                    setChoices((current) => {
                      const next = { ...current };
                      delete next[choiceKey];
                      return next;
                    })
                  }
                >
                  移除
                </button>
              </div>
            );
          })}
        </div>
      )}

      {message && <p className={message.includes("failed") || message.includes("Please") || message.includes("already") ? "error" : "hint"}>{message}</p>}

      <StudentBookingGroup
        title="即将开始的课程"
        bookings={groupedMyBookings.upcoming}
        timezone={timezone}
        loading={loading}
        tone="upcoming"
        onCancel={cancelStudentBooking}
      />
      <StudentBookingGroup
        title="已结束课程"
        bookings={groupedMyBookings.passed}
        timezone={timezone}
        loading={loading}
        tone="passed"
        onCancel={cancelStudentBooking}
      />
    </article>
  );

  async function cancelStudentBooking(bookingId: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/student/lesson-bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "取消失败。");
      await loadSchedule();
      setMessage("课程已取消。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消失败。");
    } finally {
      setLoading(false);
    }
  }
}

function StudentBookingGroup({
  title,
  bookings,
  timezone,
  loading,
  tone,
  onCancel
}: {
  title: string;
  bookings: LessonBooking[];
  timezone: string;
  loading: boolean;
  tone: "upcoming" | "passed";
  onCancel: (bookingId: string) => void;
}) {
  return (
    <div className="stack">
      <div className="section-head compact">
        <h3>{title}</h3>
        <span className="pill">{bookings.length}</span>
      </div>
      {bookings.length ? (
        <div className="schedule-grid">
          {bookings.map((booking) => (
            <div className={`schedule-card booked ${tone}`} key={booking.id}>
              <strong>{formatRange(booking.start_at, booking.end_at, timezone)}</strong>
              <span className={`pill ${isConfirmedBooking(booking) ? "ok" : booking.status === "pending" ? "warn" : ""}`}>
                {bookingStatusLabel(booking)}
              </span>
              <span className="hint">
                {bookingTypeLabel((booking.booking_type as BookingType) || "regular")} ·{" "}
                {booking.course_minutes / 60} 小时课程，预留 {booking.reserved_minutes} 分钟
              </span>
              {booking.status === "cancelled" && booking.teacher_suggested_time && (
                <span className="hint">老师建议时间：{formatSuggestedTime(booking.teacher_suggested_time, timezone)}</span>
              )}
              {booking.status !== "cancelled" && tone !== "passed" && (
                <button
                  className="btn secondary"
                  disabled={loading || !canCancelBeforeFourHours(booking.start_at)}
                  onClick={() => onCancel(booking.id)}
                  type="button"
                >
                  取消预约
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">该分组暂无课程。</p>
      )}
    </div>
  );
}

function ScheduleHeader({
  title,
  hint,
  timezone,
  weekStart,
  loading,
  setTimezone,
  setWeekStart,
  onRefresh,
  language = "zh"
}: {
  title: string;
  hint: string;
  timezone: string;
  weekStart: string;
  loading: boolean;
  setTimezone: (timezone: string) => void;
  setWeekStart: (weekStart: string) => void;
  onRefresh: () => void;
  language?: ScheduleLanguage;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <div className="hint">{hint}</div>
        </div>
        <button className="btn secondary" disabled={loading} onClick={onRefresh} type="button">
          {loading ? t("加载中...", "Loading...") : t("刷新", "Refresh")}
        </button>
      </div>
      <div className="calendar-toolbar">
        <button className="btn secondary" type="button" onClick={() => setWeekStart(addDaysDateKey(weekStart, -7))}>
          {t("上一周", "Previous week")}
        </button>
        <strong>{`${formatDateKey(weekStart)} - ${formatDateKey(addDaysDateKey(weekStart, 6))}`}</strong>
        <button className="btn secondary" type="button" onClick={() => setWeekStart(addDaysDateKey(weekStart, 7))}>
          {t("下一周", "Next week")}
        </button>
        <div>
          <label>{t("时区", "Timezone")}</label>
          <TimeZoneSelect value={timezone} onChange={setTimezone} />
        </div>
      </div>
    </div>
  );
}

function TeacherBookingList({
  bookings,
  timezone,
  language = "zh",
  suggestions,
  loading,
  setSuggestions,
  onUpdate
}: {
  bookings: LessonBooking[];
  timezone: string;
  language?: ScheduleLanguage;
  suggestions: Record<string, string>;
  loading: boolean;
  setSuggestions: (suggestions: Record<string, string>) => void;
  onUpdate: (bookingId: string, action: "confirm" | "cancel") => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const visibleBookings = bookings
    .filter((booking) => booking.status !== "cancelled")
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const { upcoming, passed } = splitBookingsByTime(visibleBookings);

  return (
    <div className="stack">
      <div className="section-head compact">
        <h3>{t("课程预约请求", "Lesson booking requests")}</h3>
        <span className="pill">{visibleBookings.length}</span>
      </div>
      {visibleBookings.length ? (
        <div className="stack">
          <TeacherBookingGroup
            title={t("即将开始的课程", "Upcoming lessons")}
            bookings={upcoming}
            timezone={timezone}
            language={language}
            suggestions={suggestions}
            loading={loading}
            tone="upcoming"
            setSuggestions={setSuggestions}
            onUpdate={onUpdate}
          />
          <TeacherBookingGroup
            title={t("已结束课程", "Past lessons")}
            bookings={passed}
            timezone={timezone}
            language={language}
            suggestions={suggestions}
            loading={loading}
            tone="passed"
            setSuggestions={setSuggestions}
            onUpdate={onUpdate}
          />
        </div>
      ) : (
        <p className="hint">{t("还没有课程预约请求。", "No lesson booking requests yet.")}</p>
      )}
    </div>
  );
}

function TeacherBookingGroup({
  title,
  bookings,
  timezone,
  language = "zh",
  suggestions,
  loading,
  tone,
  setSuggestions,
  onUpdate
}: {
  title: string;
  bookings: LessonBooking[];
  timezone: string;
  language?: ScheduleLanguage;
  suggestions: Record<string, string>;
  loading: boolean;
  tone: "upcoming" | "passed";
  setSuggestions: (suggestions: Record<string, string>) => void;
  onUpdate: (bookingId: string, action: "confirm" | "cancel") => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  return (
    <div className="stack">
      <div className="section-head compact">
        <h4>{title}</h4>
        <span className="pill">{bookings.length}</span>
      </div>
      {bookings.length ? (
        <div className="booking-admin-list">
          {bookings.map((booking) => (
            <div className={`booking-admin-row ${tone}`} key={booking.id}>
              <div className="stack">
                <strong>{booking.student_name}</strong>
                <span className="hint">{formatRange(booking.start_at, booking.end_at, timezone)}</span>
                <span className={`pill ${isConfirmedBooking(booking) ? "ok" : "warn"}`}>{bookingStatusLabel(booking, language)}</span>
              </div>
              <button
                className="btn"
                disabled={loading || tone === "passed" || isConfirmedBooking(booking)}
                onClick={() => onUpdate(booking.id, "confirm")}
                type="button"
              >
                {t("确认", "Confirm")}
              </button>
              <div>
                <label>{t("取消后建议的新时间", "Suggested new time if cancelled")}</label>
                <input
                  type="datetime-local"
                  value={suggestions[booking.id] || ""}
                  disabled={tone === "passed"}
                  onChange={(event) => setSuggestions({ ...suggestions, [booking.id]: event.target.value })}
                />
              </div>
              <button
                className="btn secondary"
                disabled={loading || tone === "passed" || !canCancelBeforeFourHours(booking.start_at)}
                onClick={() => onUpdate(booking.id, "cancel")}
                type="button"
              >
                {t("取消", "Cancel")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">{t("该分组暂无课程。", "No lessons in this group.")}</p>
      )}
    </div>
  );
}

function CalendarWeek({
  days,
  timezone,
  language = "zh",
  slots,
  selectedSlotIds,
  onEmptyClick,
  onSlotClick,
  renderEventAction
}: {
  days: string[];
  timezone: string;
  language?: ScheduleLanguage;
  slots: LessonSlot[];
  selectedSlotIds: string[];
  onEmptyClick: (dateTimeValue: string) => void;
  onSlotClick: (slot: LessonSlot, startAt?: string) => void;
  renderEventAction: (slot: LessonSlot) => ReactNode;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const selectedKeys = selectedSlotIds;
  const [hoverPreview, setHoverPreview] = useState<{ slotId: string; startAt: string; top: number } | null>(null);

  return (
    <div className="calendar-shell">
      <div className="calendar-header-spacer" />
      {days.map((day) => (
        <div className="calendar-day-head" key={day}>
          <strong>{dayNames[language][new Date(`${day}T00:00:00Z`).getUTCDay()]}</strong>
          <span>{formatDateKey(day)}</span>
        </div>
      ))}

      <div className="calendar-time-col">
        {hours.map((hour) => (
          <div className="calendar-hour-label" key={hour}>{`${String(hour).padStart(2, "0")}:00`}</div>
        ))}
      </div>

      {days.map((day) => (
        <div className="calendar-day-col" key={day}>
          {hours.map((hour) => (
            <button
              className="calendar-hour-cell"
              key={`${day}-${hour}`}
              onClick={() => onEmptyClick(`${day}T${String(hour).padStart(2, "0")}:00`)}
              type="button"
            />
          ))}
          {slots
            .map((slot) => ({ slot, placement: slotPlacement(slot, day, timezone) }))
            .filter(({ placement }) => placement)
            .map(({ slot, placement }) => {
              return (
                <div
                  className={`calendar-event ${selectedKeys.some((key) => key.startsWith(`${slot.id}-`)) ? "selected" : ""}`}
                  key={slot.id}
                  onClick={(event) => onSlotClick(slot, clickStartAt(slot, event, timezone))}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSlotClick(slot, slot.start_at);
                  }}
                  onMouseLeave={() => setHoverPreview(null)}
                  onMouseMove={(event) => setHoverPreview(previewStartAt(slot, event, timezone))}
                  role="button"
                  style={{
                    top: `${placement!.top}px`,
                    height: `${Math.max(placement!.height, 34)}px`
                  }}
                  tabIndex={0}
                >
                  {hoverPreview?.slotId === slot.id && (
                    <span className="calendar-time-preview" style={{ top: `${hoverPreview.top}px` }}>
                      {formatTimeOnly(hoverPreview.startAt, timezone)}
                    </span>
                  )}
                  <strong>{formatEventTime(slot, timezone)}</strong>
                  <span>{slot.note || t("可预约", "Available")}</span>
                  {/* Deleting a slot should not also count as clicking the
                      slot: the action sits inside the clickable region. */}
                  <span className="calendar-event-action" onClick={(event) => event.stopPropagation()}>
                    {renderEventAction(slot)}
                  </span>
                </div>
              );
            })}
          {slots
            .flatMap((slot) => activeBookings(slot))
            .map((booking) => ({ booking, placement: bookingPlacement(booking, day, timezone) }))
            .filter(({ placement }) => placement)
            .map(({ booking, placement }) => (
              <div
                className={`calendar-event booked ${isPassedBooking(booking) ? "passed" : "upcoming"}`}
                key={booking.id}
                style={{
                  top: `${placement!.top}px`,
                  height: `${Math.max(placement!.height, 34)}px`
                }}
              >
                <strong>{formatRange(booking.start_at, booking.end_at, timezone)}</strong>
                <span>{bookingStatusLabel(booking, language)}</span>
                <span>
                  {booking.student_name}
                  {booking.booking_type === "trial" ? ` · ${bookingTypeLabel("trial", language)}` : ""}
                </span>
                <span>{booking.course_minutes / 60}h</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function TimeZoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {timeZones.map((timeZone) => (
        <option key={timeZone} value={timeZone}>
          {timeZone}
        </option>
      ))}
    </select>
  );
}

function activeBookings(slot: LessonSlot) {
  return (slot.bookings || []).filter((booking) => booking.status !== "cancelled");
}

function splitBookingsByTime(bookings: LessonBooking[]) {
  const now = Date.now();
  const sorted = [...bookings].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return {
    upcoming: sorted.filter((booking) => new Date(booking.end_at).getTime() >= now),
    passed: sorted.filter((booking) => new Date(booking.end_at).getTime() < now)
  };
}

function isPassedBooking(booking: LessonBooking) {
  return new Date(booking.end_at).getTime() < Date.now();
}

function bookingStatusLabel(booking: LessonBooking, language: ScheduleLanguage = "zh") {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  if (booking.status === "pending") return t("待老师确认", "Pending confirmation");
  if (isConfirmedBooking(booking)) return t("已确认", "Confirmed");
  if (booking.cancelled_by === "teacher") return t("老师已取消", "Cancelled by teacher");
  if (booking.cancelled_by === "student") return t("学生已取消", "Cancelled by student");
  return t("已取消", "Cancelled");
}

function isConfirmedBooking(booking: LessonBooking) {
  return booking.status === "confirmed" || booking.status === "booked";
}

function formatSuggestedTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatRange(date.toISOString(), new Date(date.getTime() + 90 * 60 * 1000).toISOString(), timeZone);
}

function canCancelBeforeFourHours(startAt: string) {
  return new Date(startAt).getTime() - Date.now() >= 4 * 60 * 60 * 1000;
}

function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

function todayDateKey(timeZone: string) {
  return dateParts(new Date(), timeZone).dateKey;
}

function weekStartKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return addDaysDateKey(dateKey, -date.getUTCDay());
}

function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDaysDateKey(weekStart, index));
}

function addDaysDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addLocalMinutes(value: string, minutes: number) {
  const date = new Date(`${value}:00`);
  date.setMinutes(date.getMinutes() + minutes);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateKey(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function formatRange(startAt: string, endAt: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return `${formatter.format(new Date(startAt))} - ${formatter.format(new Date(endAt))}`;
}

function formatEventTime(slot: LessonSlot, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return `${formatter.format(new Date(slot.start_at))} - ${formatter.format(new Date(slot.end_at))}`;
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function slotPlacement(slot: LessonSlot, day: string, timeZone: string) {
  return calendarPlacement(slot.start_at, slot.end_at, day, timeZone);
}

function bookingPlacement(booking: LessonBooking, day: string, timeZone: string) {
  return calendarPlacement(booking.start_at, booking.end_at, day, timeZone);
}

function calendarPlacement(startAt: string, endAt: string, day: string, timeZone: string) {
  const start = dateParts(new Date(startAt), timeZone);
  if (start.dateKey !== day) return null;
  const top = ((start.hour - startHour) * 60 + start.minute) * (hourHeight / 60);
  const duration = minutesBetween(startAt, endAt);
  return {
    top,
    height: duration * (hourHeight / 60)
  };
}

function clickStartAt(slot: LessonSlot, event: MouseEvent<HTMLElement>, timeZone: string) {
  return snappedSlotStart(slot, event, timeZone).startAt;
}

function previewStartAt(slot: LessonSlot, event: MouseEvent<HTMLElement>, timeZone: string) {
  const snapped = snappedSlotStart(slot, event, timeZone);
  const placement = slotPlacement({ ...slot, start_at: snapped.startAt, end_at: bookingEndAt(snapped.startAt, 60, slot.lesson_type === "practice" ? "practice" : "regular") }, dateParts(new Date(snapped.startAt), timeZone).dateKey, timeZone);
  const slotTop = slotPlacement(slot, dateParts(new Date(slot.start_at), timeZone).dateKey, timeZone)?.top || 0;
  return {
    slotId: slot.id,
    startAt: snapped.startAt,
    top: Math.max(0, (placement?.top || slotTop) - slotTop)
  };
}

function snappedSlotStart(slot: LessonSlot, event: MouseEvent<HTMLElement>, timeZone: string) {
  const rect = event.currentTarget.getBoundingClientRect();
  const y = Math.max(0, event.clientY - rect.top);
  const minutesIntoSlot = Math.round((y / hourHeight) * 4) * 15;
  const clicked = new Date(new Date(slot.start_at).getTime() + minutesIntoSlot * 60 * 1000);
  const minimumMinutes = slot.lesson_type === "practice" ? 60 : 90;
  const maxStart = new Date(new Date(slot.end_at).getTime() - minimumMinutes * 60 * 1000);
  const start = clicked > maxStart ? maxStart : clicked;
  return { startAt: snapIsoToQuarterHour(start.toISOString(), timeZone) };
}

function snapIsoToQuarterHour(value: string, timeZone: string) {
  const parts = dateParts(new Date(value), timeZone);
  const snappedMinute = Math.round(parts.minute / 15) * 15;
  const localValue = `${parts.dateKey}T${String(parts.hour).padStart(2, "0")}:${String(snappedMinute === 60 ? 0 : snappedMinute).padStart(2, "0")}`;
  const adjusted = snappedMinute === 60 ? addLocalMinutes(localValue, 60) : localValue;
  return localDateTimeToUtc(adjusted, timeZone);
}

function formatTimeOnly(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function canBookLesson(
  slot: LessonSlot,
  startAt: string,
  courseMinutes: BookingChoice,
  lessonType: LessonType = "regular",
  bookingType: "trial" | "regular" = "regular"
) {
  const endAt = bookingEndAt(startAt, courseMinutes, lessonType, bookingType);
  if (new Date(startAt) < new Date(slot.start_at) || new Date(endAt) > new Date(slot.end_at)) return false;
  return !activeBookings(slot).some((booking) => rangesOverlap(startAt, endAt, booking.start_at, booking.end_at));
}

function bookingEndAt(
  startAt: string,
  courseMinutes: BookingChoice,
  lessonType: LessonType = "regular",
  bookingType: "trial" | "regular" = "regular"
) {
  const reservedMinutes = reservedMinutesFor(lessonType === "practice" ? "practice" : bookingType, courseMinutes);
  return new Date(new Date(startAt).getTime() + reservedMinutes * 60 * 1000).toISOString();
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

function minutesBetween(startAt: string, endAt: string) {
  return Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
}

function localDateTimeToUtc(value: string, timeZone: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  let utcTime = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let index = 0; index < 3; index += 1) {
    const offset = timeZoneOffsetMs(new Date(utcTime), timeZone);
    utcTime = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }

  return new Date(utcTime).toISOString();
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const asUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return asUtc - date.getTime();
}
