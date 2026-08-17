"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyTask, StudentProfile } from "@/lib/types";

type TeacherDailyTasksProps = {
  students: StudentProfile[];
  api: (path: string, init?: RequestInit) => Promise<any>;
  mode?: "assign" | "progress";
  language?: "zh" | "en";
};

export function TeacherDailyTasksPanel({ students, api, mode = "assign", language = "zh" }: TeacherDailyTasksProps) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [selectedStudentName, setSelectedStudentName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("词汇");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(todayString());
  const [endDate, setEndDate] = useState(todayString());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedStudent = selectedStudentName || students[0]?.name || "";
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);

  useEffect(() => {
    void loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    try {
      const data = await api("/api/teacher/daily-tasks");
      setTasks(data.tasks || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载每日任务。");
    } finally {
      setLoading(false);
    }
  }

  async function createTask() {
    setMessage("");
    try {
      if (!title.trim()) throw new Error("请输入任务标题。");
      if (!selectedStudents.length) throw new Error("请至少选择一位学生。");
      const data = await api("/api/teacher/daily-tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          taskType,
          assignedStudents: selectedStudents,
          startDate,
          endDate
        })
      });
      setTasks([data.task, ...tasks]);
      setTitle("");
      setDescription("");
      setSelectedStudents([]);
      setMessage("每日任务已创建。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法创建每日任务。");
    }
  }

  async function deleteTask(taskId: string) {
    setMessage("");
    try {
      await api(`/api/teacher/daily-tasks?taskId=${taskId}`, { method: "DELETE" });
      setTasks(tasks.filter((task) => task.id !== taskId));
      setMessage("每日任务已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法删除每日任务。");
    }
  }

  function toggleStudent(studentName: string) {
    setSelectedStudents((current) =>
      current.includes(studentName) ? current.filter((name) => name !== studentName) : [...current, studentName]
    );
  }

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>{t("每日学习任务", "Daily study tasks")}</h2>
          <div className="hint">
            {mode === "assign"
              ? t("为学生设置一段时间内每天需要完成的任务。", "Set daily tasks for students over a date range.")
              : t("查看学生每日任务完成情况和打卡进度。", "Review student daily task completion and check-in progress.")}
          </div>
        </div>
        <button className="btn secondary" type="button" onClick={() => void loadTasks()} disabled={loading}>
          {loading ? t("加载中...", "Loading...") : t("刷新", "Refresh")}
        </button>
      </div>

      {mode === "assign" && (
        <section className="daily-task-editor">
          <div>
            <label>{t("任务标题", "Task title")}</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("例如：背诵 30 个 IELTS 单词", "e.g. Memorize 30 IELTS words")} />
          </div>
          <div>
            <label>{t("任务类型", "Task type")}</label>
            <select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
              <option>词汇</option>
              <option>口语话题</option>
              <option>听力</option>
              <option>阅读</option>
              <option>写作</option>
              <option>综合</option>
            </select>
          </div>
          <div>
            <label>{t("开始日期", "Start date")}</label>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div>
            <label>{t("结束日期", "End date")}</label>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="daily-task-description">
            <label>{t("任务说明", "Task details")}</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("请写清楚学生每天具体要完成什么。", "Describe exactly what the student should complete each day.")} />
          </div>
          <div className="daily-task-students">
            <label>{t("分配给学生", "Assign to students")}</label>
            <div className="student-check-list compact">
              {students.map((student) => (
                <label key={student.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedStudents.includes(student.name)}
                    onChange={() => toggleStudent(student.name)}
                  />
                  <span>{student.name}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="btn daily-task-create" type="button" onClick={() => void createTask()}>
            {t("创建每日任务", "Create daily task")}
          </button>
        </section>
      )}

      {message && <p className={message.includes("Could not") || message.includes("Please") ? "error" : "hint"}>{message}</p>}

      {mode === "progress" && (
        <StudentDailyTaskHistory
          students={students}
          tasks={tasks}
          selectedStudent={selectedStudent}
          onSelectStudent={setSelectedStudentName}
          onDeleteTask={deleteTask}
        />
      )}

      <section className="daily-task-grid teacher-task-grid-hidden">
        {tasks.length ? (
          tasks.map((task) => (
            <TeacherDailyTaskCard key={task.id} task={task} onDelete={deleteTask} />
          ))
        ) : (
          <p className="hint">{t("还没有每日任务。", "No daily tasks yet.")}</p>
        )}
      </section>

      <section className="daily-checkin-panel teacher-task-grid-hidden">
        <div className="section-head">
          <div>
            <h2>{t("学生打卡情况", "Student check-in status")}</h2>
            <div className="hint">{t("先看每位学生今天的打卡状态，点开后查看每日打卡日历。", "Check each student's status today, then open a student to view the calendar.")}</div>
          </div>
          <span className="pill">{students.length} {t("位学生", "students")}</span>
        </div>
        <div className="daily-student-overview">
          {students.length ? (
            students.map((student) => {
              const summary = getStudentTodaySummary(tasks, student.name);
              const active = normalizeName(student.name) === normalizeName(selectedStudent);
              return (
                <button
                  className={`daily-student-card ${active ? "active" : ""}`}
                  key={student.id}
                  type="button"
                  onClick={() => setSelectedStudentName(student.name)}
                >
                  <strong>{student.name}</strong>
                  <span>{student.phone || t("暂无手机号", "No phone number")}</span>
                  <span className={`pill ${summary.due && summary.completed >= summary.due ? "ok" : summary.due ? "warn" : ""}`}>
                    {t("今日", "Today")} {summary.completed}/{summary.due}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="hint">{t("还没有学生档案。", "No student profiles yet.")}</p>
          )}
        </div>
        {selectedStudent ? <StudentCheckinCalendar studentName={selectedStudent} tasks={tasks} /> : null}
      </section>
    </article>
  );
}

export function StudentDailyTasksPanel({ account }: { account?: { id: string; role: string; display_name: string } | null }) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [today, setToday] = useState(todayString());
  const [message, setMessage] = useState("");
  const [loadingTaskId, setLoadingTaskId] = useState("");
  const todaySummary = getTodayTaskSummary(tasks, today);

  useEffect(() => {
    void loadTasks();
  }, []);

  async function loadTasks() {
    const response = await fetch("/api/student/daily-tasks", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "无法加载每日任务。");
      return;
    }
    setTasks(data.tasks || []);
    setToday(data.today || todayString());
  }

  async function checkIn(taskId: string) {
    setLoadingTaskId(taskId);
    setMessage("");
    try {
      const response = await fetch("/api/student/daily-tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, checkinDate: today })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "打卡失败。");
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                checkins: [
                  ...(task.checkins || []).filter((checkin) => !sameDate(checkin.checkin_date, today)),
                  {
                    id: `local-${taskId}-${today}`,
                    task_id: taskId,
                    student_name: account?.display_name || "",
                    checkin_date: today,
                    checked_at: new Date().toISOString()
                  }
                ]
              }
            : task
        )
      );
      await loadTasks();
      setMessage("今日已打卡。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "打卡失败。");
    } finally {
      setLoadingTaskId("");
    }
  }

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>每日学习打卡</h2>
          <div className="hint">完成老师布置的每日任务后，在这里打卡。</div>
        </div>
        <span className="pill">{tasks.length} 项</span>
      </div>
      {message && <p className={message.includes("Could not") || message.includes("Unauthorized") ? "error" : "hint"}>{message}</p>}
      <section className={`daily-today-summary ${todaySummary.due && todaySummary.completed >= todaySummary.due ? "completed" : ""}`}>
        <div>
          <strong>
            今日进度 {todaySummary.completed}/{todaySummary.due}
          </strong>
          <p className="hint">
            {todaySummary.due && todaySummary.completed >= todaySummary.due
              ? "你已完成当日全部打卡任务！"
              : "完成任务后点击打卡，今日进度会自动更新。"}
          </p>
        </div>
      </section>
      <div className="daily-task-grid">
        {tasks.length ? (
          tasks.map((task) => {
            const checkedToday = (task.checkins || []).some((checkin) => sameDate(checkin.checkin_date, today));
            return (
              <div className={`daily-task-card ${checkedToday ? "completed" : ""}`} key={task.id}>
                <div className="section-head compact">
                  <div>
                    <h3>{task.title}</h3>
                    <div className="hint">{task.task_type}</div>
                  </div>
                  <span className={`pill ${checkedToday ? "ok" : "warn"}`}>{checkedToday ? "已打卡" : "待打卡"}</span>
                </div>
                {task.description && <p>{task.description}</p>}
                <div className="hint">
                  {formatDate(task.start_date)} - {formatDate(task.end_date)}
                </div>
                <TaskProgress task={task} studentName="" />
                <button className="btn" type="button" disabled={checkedToday || loadingTaskId === task.id} onClick={() => void checkIn(task.id)}>
                  {checkedToday ? "今日已完成" : loadingTaskId === task.id ? "保存中..." : "今日打卡"}
                </button>
              </div>
            );
          })
        ) : (
          <p className="hint">今天没有每日任务。</p>
        )}
      </div>
    </article>
  );
}

function StudentDailyTaskHistory({
  students,
  tasks,
  selectedStudent,
  onSelectStudent,
  onDeleteTask
}: {
  students: StudentProfile[];
  tasks: DailyTask[];
  selectedStudent: string;
  onSelectStudent: (studentName: string) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
}) {
  const selectedTasks = tasks.filter((task) =>
    task.assigned_students.some((studentName) => normalizeName(studentName) === normalizeName(selectedStudent))
  );

  return (
    <section className="daily-history-panel">
      <div className="section-head">
        <div>
          <h2>每日任务历史</h2>
          <div className="hint">选择学生后查看已分配任务和完成进度。</div>
        </div>
        <span className="pill">{students.length} 位学生</span>
      </div>
      <div className="daily-history-layout">
        <aside className="daily-history-sidebar">
          {students.length ? (
            students.map((student) => {
              const summary = getStudentTodaySummary(tasks, student.name);
              const assignedCount = tasks.filter((task) =>
                task.assigned_students.some((studentName) => normalizeName(studentName) === normalizeName(student.name))
              ).length;
              const active = normalizeName(student.name) === normalizeName(selectedStudent);
              return (
                <button
                  className={`daily-student-card ${active ? "active" : ""}`}
                  key={student.id}
                  type="button"
                  onClick={() => onSelectStudent(student.name)}
                >
                  <strong>{student.name}</strong>
                  <span>{student.phone || "暂无手机号"}</span>
                  <span>{assignedCount} 项每日任务</span>
                  <span className={`pill ${summary.due && summary.completed >= summary.due ? "ok" : summary.due ? "warn" : ""}`}>
                    今日 {summary.completed}/{summary.due}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="hint">还没有学生档案。</p>
          )}
        </aside>
        <div className="daily-history-main">
          {selectedStudent ? (
            <>
              <div className="section-head compact">
                <div>
                  <h3>{selectedStudent}</h3>
                  <div className="hint">已分配每日任务和打卡进度。</div>
                </div>
                <span className="pill">{selectedTasks.length} 项任务</span>
              </div>
              <div className="daily-student-task-list">
                {selectedTasks.length ? (
                  selectedTasks.map((task) => (
                    <StudentAssignedTaskCard key={task.id} task={task} studentName={selectedStudent} onDelete={onDeleteTask} />
                  ))
                ) : (
                  <p className="hint">还没有给该学生分配每日任务。</p>
                )}
              </div>
              <StudentCheckinCalendar studentName={selectedStudent} tasks={tasks} />
            </>
          ) : (
            <div className="empty-state">
              <h3>请选择学生</h3>
              <p className="hint">从左侧选择学生后查看每日任务。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StudentAssignedTaskCard({
  task,
  studentName,
  onDelete
}: {
  task: DailyTask;
  studentName: string;
  onDelete: (taskId: string) => Promise<void>;
}) {
  return (
    <div className="daily-task-card">
      <div className="section-head compact">
        <div>
          <h3>{task.title}</h3>
          <div className="hint">{task.task_type}</div>
        </div>
        <span className="pill">{formatDate(task.start_date)} - {formatDate(task.end_date)}</span>
      </div>
      {task.description && <p>{task.description}</p>}
      <TaskProgress task={task} studentName={studentName} />
      <button className="btn danger" type="button" onClick={() => void onDelete(task.id)}>
        删除
      </button>
    </div>
  );
}

function TeacherDailyTaskCard({ task, onDelete }: { task: DailyTask; onDelete: (taskId: string) => Promise<void> }) {
  return (
    <div className="daily-task-card">
      <div className="section-head compact">
        <div>
          <h3>{task.title}</h3>
          <div className="hint">{task.task_type}</div>
        </div>
        <span className="pill">{task.assigned_students.length} 位学生</span>
      </div>
      {task.description && <p>{task.description}</p>}
      <div className="hint">
        {formatDate(task.start_date)} - {formatDate(task.end_date)}
      </div>
      <div className="daily-student-progress">
        {task.assigned_students.map((studentName) => (
          <div className="daily-student-row" key={studentName}>
            <strong>{studentName}</strong>
            <TaskProgress task={task} studentName={studentName} />
          </div>
        ))}
      </div>
      <button className="btn danger" type="button" onClick={() => void onDelete(task.id)}>
        删除
      </button>
    </div>
  );
}

function StudentCheckinCalendar({ studentName, tasks }: { studentName: string; tasks: DailyTask[] }) {
  const studentTasks = useMemo(
    () => tasks.filter((task) => task.assigned_students.some((name) => normalizeName(name) === normalizeName(studentName))),
    [studentName, tasks]
  );
  const days = useMemo(() => buildStudentCalendarDays(studentTasks, studentName), [studentTasks, studentName]);
  const completedDays = days.filter((day) => day.due > 0 && day.completed >= day.due).length;
  const dueDays = days.filter((day) => day.due > 0).length;

  return (
    <div className="daily-calendar-card">
      <div className="section-head compact">
        <div>
          <h3>{studentName}</h3>
          <div className="hint">每日打卡日历</div>
        </div>
        <span className="pill ok">
          {completedDays}/{dueDays} 天已完成
        </span>
      </div>
      {days.length ? (
        <>
          <div className="daily-calendar-weekdays">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => (
              <strong key={day}>{day}</strong>
            ))}
          </div>
          <div className="daily-calendar-grid">
            {Array.from({ length: firstDayOffset(days[0].date) }).map((_, index) => (
              <span className="daily-calendar-empty" key={`empty-${index}`} />
            ))}
            {days.map((day) => (
              <div className={`daily-calendar-day ${dayClass(day)}`} key={day.date}>
                <strong>{Number(day.date.slice(-2))}</strong>
                {day.due ? <span>{day.completed}/{day.due}</span> : <span>无任务</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="hint">还没有给该学生分配每日任务。</p>
      )}
    </div>
  );
}

function TaskProgress({ task, studentName }: { task: DailyTask; studentName: string }) {
  const total = countDays(task.start_date, task.end_date);
  const completed = (task.checkins || []).filter((checkin) =>
    studentName ? checkin.student_name.trim().toLowerCase() === studentName.trim().toLowerCase() : true
  ).length;
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <div className="daily-progress">
      <div className="progress-track">
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="hint">
        {completed}/{total} 天
      </span>
    </div>
  );
}

function getStudentTodaySummary(tasks: DailyTask[], studentName: string) {
  const today = todayString();
  const candidateDates = [today, shiftDate(today, 1), shiftDate(today, -1)];
  const summaries = candidateDates.map((date) => getStudentSummaryForDate(tasks, studentName, date));
  return summaries.sort((a, b) => b.completed - a.completed || Number(b.date === today) - Number(a.date === today))[0];
}

function getStudentSummaryForDate(tasks: DailyTask[], studentName: string, date: string) {
  const dueTasks = tasks.filter(
    (task) =>
      dateOnly(task.start_date) <= date &&
      dateOnly(task.end_date) >= date &&
      task.assigned_students.some((name) => normalizeName(name) === normalizeName(studentName))
  );
  const completed = dueTasks.filter((task) =>
    (task.checkins || []).some((checkin) => normalizeName(checkin.student_name) === normalizeName(studentName) && sameDate(checkin.checkin_date, date))
  ).length;
  return { date, due: dueTasks.length, completed };
}

function getTodayTaskSummary(tasks: DailyTask[], today: string) {
  const dueTasks = tasks.filter((task) => dateOnly(task.start_date) <= today && dateOnly(task.end_date) >= today);
  const completed = dueTasks.filter((task) => (task.checkins || []).some((checkin) => sameDate(checkin.checkin_date, today))).length;
  return { due: dueTasks.length, completed };
}

function buildStudentCalendarDays(tasks: DailyTask[], studentName: string) {
  if (!tasks.length) return [];
  const min = tasks.reduce((earliest, task) => (dateOnly(task.start_date) < earliest ? dateOnly(task.start_date) : earliest), dateOnly(tasks[0].start_date));
  const max = tasks.reduce((latest, task) => (dateOnly(task.end_date) > latest ? dateOnly(task.end_date) : latest), dateOnly(tasks[0].end_date));
  const days: { date: string; due: number; completed: number }[] = [];
  const cursor = new Date(`${min}T00:00:00`);
  const end = new Date(`${max}T00:00:00`);

  while (cursor <= end) {
    const date = dateToInputValue(cursor);
    const dueTasks = tasks.filter((task) => dateOnly(task.start_date) <= date && dateOnly(task.end_date) >= date);
    const completed = dueTasks.filter((task) =>
      (task.checkins || []).some((checkin) => normalizeName(checkin.student_name) === normalizeName(studentName) && sameDate(checkin.checkin_date, date))
    ).length;
    days.push({ date, due: dueTasks.length, completed });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function dayClass(day: { due: number; completed: number }) {
  if (!day.due) return "empty";
  if (day.completed >= day.due) return "completed";
  if (day.completed > 0) return "partial";
  return "missed";
}

function firstDayOffset(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 6 : day - 1;
}

function countDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function todayString() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

function dateToInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateToInputValue(date);
}

function sameDate(value: string, expectedDate: string) {
  return dateOnly(value) === expectedDate;
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN");
}
