"use client";

import { useEffect, useMemo, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";
import type { DailyTask, StudentProfile } from "@/lib/types";

const TASK_TYPES = ["词汇", "口语话题", "听力", "阅读", "写作", "综合"];

// The type is stored in Chinese; this is only how it is shown.
const TASK_TYPE_EN: Record<string, string> = {
  词汇: "Vocabulary",
  口语话题: "Speaking topic",
  听力: "Listening",
  阅读: "Reading",
  写作: "Writing",
  综合: "Mixed"
};
function taskTypeLabel(type: string) {
  return tr(type, TASK_TYPE_EN[type] || type);
}

type TeacherDailyTasksProps = {
  students: StudentProfile[];
  api: (path: string, init?: RequestInit) => Promise<any>;
  mode?: "assign" | "progress" | "both";
  language?: "zh" | "en";
};

export function TeacherDailyTasksPanel({ students, api, mode = "both", language = "zh" }: TeacherDailyTasksProps) {
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
  const { t } = useLanguage();

  useEffect(() => {
    void loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    try {
      const data = await api("/api/teacher/daily-tasks");
      setTasks(data.tasks || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("无法加载每日任务。", "Could not load daily tasks."));
    } finally {
      setLoading(false);
    }
  }

  async function createTask() {
    setMessage("");
    try {
      if (!title.trim()) throw new Error(tr("请输入任务标题。", "Please enter a task title."));
      if (!selectedStudents.length) throw new Error(tr("请至少选择一位学生。", "Please select at least one student."));
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
      setMessage(tr("每日任务已创建。", "Daily task created."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("无法创建每日任务。", "Could not create the task."));
    }
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    setMessage("");
    try {
      const data = await api("/api/teacher/daily-tasks", {
        method: "PATCH",
        body: JSON.stringify({ taskId, ...patch })
      });
      setTasks((current) => current.map((task) => (task.id === taskId ? data.task : task)));
      setMessage(tr("每日任务已更新。", "Daily task updated."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("无法更新每日任务。", "Could not update the task."));
      throw error;
    }
  }

  async function deleteTask(taskId: string) {
    setMessage("");
    try {
      await api(`/api/teacher/daily-tasks?taskId=${taskId}`, { method: "DELETE" });
      setTasks(tasks.filter((task) => task.id !== taskId));
      setMessage(tr("每日任务已删除。", "Daily task deleted."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("无法删除每日任务。", "Could not delete the task."));
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
              : mode === "progress"
                ? t("查看学生每日任务完成情况和打卡进度。", "Review student daily task completion and check-in progress.")
                : t(
                    "设置每天要完成的任务，并查看学生的打卡情况。",
                    "Set the daily tasks, and see how students are checking in."
                  )}
          </div>
        </div>
        <button className="btn secondary" type="button" onClick={() => void loadTasks()} disabled={loading}>
          {loading ? t("加载中...", "Loading...") : t("刷新", "Refresh")}
        </button>
      </div>

      {mode !== "progress" && (
        <section className="daily-task-editor">
          <div>
            <label>{t("任务标题", "Task title")}</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("例如：背诵 30 个 IELTS 单词", "e.g. Memorize 30 IELTS words")} />
          </div>
          <div>
            <label>{t("任务类型", "Task type")}</label>
            <select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {taskTypeLabel(type)}
                </option>
              ))}
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
          <button className="btn accent daily-task-create" type="button" onClick={() => void createTask()}>
            {t("创建每日任务", "Create daily task")}
          </button>
        </section>
      )}

      {message && <p className={message.includes("Could not") || message.includes("Please") ? "error" : "hint"}>{message}</p>}

      {mode !== "assign" && (
        <StudentDailyTaskHistory
          students={students}
          tasks={tasks}
          selectedStudent={selectedStudent}
          onSelectStudent={setSelectedStudentName}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
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
  const { t } = useLanguage();
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
      setMessage(data.error || tr("无法加载每日任务。", "Could not load daily tasks."));
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
      if (!response.ok) throw new Error(data.error || tr("打卡失败。", "Check-in failed."));
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
      setMessage(tr("今日已打卡。", "Checked in for today."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("打卡失败。", "Check-in failed."));
    } finally {
      setLoadingTaskId("");
    }
  }

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>{t("每日学习打卡", "Daily check-in")}</h2>
          <div className="hint">{t("完成老师布置的每日任务后，在这里打卡。", "Check in here once you have done the day's tasks.")}</div>
        </div>
        <span className="pill">{t(`${tasks.length} 项`, `${tasks.length}`)}</span>
      </div>
      {message && <p className={message.includes("Could not") || message.includes("Unauthorized") ? "error" : "hint"}>{message}</p>}
      <section className={`daily-today-summary ${todaySummary.due && todaySummary.completed >= todaySummary.due ? "completed" : ""}`}>
        <div>
          <strong>
            {t("今日进度", "Today")} {todaySummary.completed}/{todaySummary.due}
          </strong>
          <p className="hint">
            {todaySummary.due && todaySummary.completed >= todaySummary.due
              ? t("你已完成当日全部打卡任务！", "All of today's tasks are done!")
              : t("完成任务后点击打卡，今日进度会自动更新。", "Check in after each task; today's progress updates on its own.")}
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
                    <div className="hint">{taskTypeLabel(task.task_type)}</div>
                  </div>
                  <span className={`pill ${checkedToday ? "ok" : "warn"}`}>{checkedToday ? t("已打卡", "Done") : t("待打卡", "To do")}</span>
                </div>
                {task.description && <p>{task.description}</p>}
                <div className="hint">
                  {formatDate(task.start_date)} - {formatDate(task.end_date)}
                </div>
                <TaskProgress task={task} studentName="" />
                <button className="btn" type="button" disabled={checkedToday || loadingTaskId === task.id} onClick={() => void checkIn(task.id)}>
                  {checkedToday ? t("今日已完成", "Done today") : loadingTaskId === task.id ? t("保存中...", "Saving...") : t("今日打卡", "Check in")}
                </button>
              </div>
            );
          })
        ) : (
          <p className="hint">{t("今天没有每日任务。", "No tasks today.")}</p>
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
  onDeleteTask,
  onUpdateTask
}: {
  students: StudentProfile[];
  tasks: DailyTask[];
  selectedStudent: string;
  onSelectStudent: (studentName: string) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onUpdateTask: (taskId: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const selectedTasks = tasks.filter((task) =>
    task.assigned_students.some((studentName) => normalizeName(studentName) === normalizeName(selectedStudent))
  );
  const { t } = useLanguage();

  return (
    <section className="daily-history-panel">
      <div className="section-head">
        <div>
          <h2>{t("每日任务历史", "Task history")}</h2>
          <div className="hint">{t("选择学生后查看已分配任务和完成进度。", "Pick a student to see their tasks and progress.")}</div>
        </div>
        <span className="pill">{t(`${students.length} 位学生`, `${students.length} students`)}</span>
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
                  <span>{student.phone || t("暂无手机号", "No phone")}</span>
                  <span>{t(`${assignedCount} 项每日任务`, `${assignedCount} tasks`)}</span>
                  <span className={`pill ${summary.due && summary.completed >= summary.due ? "ok" : summary.due ? "warn" : ""}`}>
                    {t("今日", "Today")} {summary.completed}/{summary.due}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="hint">{t("还没有学生档案。", "No students yet.")}</p>
          )}
        </aside>
        <div className="daily-history-main">
          {selectedStudent ? (
            <>
              <div className="section-head compact">
                <div>
                  <h3>{selectedStudent}</h3>
                  <div className="hint">{t("已分配每日任务和打卡进度。", "Assigned tasks and check-ins.")}</div>
                </div>
                <span className="pill">{t(`${selectedTasks.length} 项任务`, `${selectedTasks.length} tasks`)}</span>
              </div>
              <div className="daily-student-task-list">
                {selectedTasks.length ? (
                  selectedTasks.map((task) => (
                    <StudentAssignedTaskCard
                      key={task.id}
                      task={task}
                      studentName={selectedStudent}
                      students={students}
                      onDelete={onDeleteTask}
                      onUpdate={onUpdateTask}
                    />
                  ))
                ) : (
                  <p className="hint">{t("还没有给该学生分配每日任务。", "No tasks assigned to this student yet.")}</p>
                )}
              </div>
              <StudentCheckinCalendar studentName={selectedStudent} tasks={tasks} />
            </>
          ) : (
            <div className="empty-state">
              <h3>{t("请选择学生", "Pick a student")}</h3>
              <p className="hint">{t("从左侧选择学生后查看每日任务。", "Choose a student on the left to see their tasks.")}</p>
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
  students,
  onDelete,
  onUpdate
}: {
  task: DailyTask;
  studentName: string;
  students: StudentProfile[];
  onDelete: (taskId: string) => Promise<void>;
  onUpdate: (taskId: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(task));
  const { t } = useLanguage();

  const today = todayString();
  const ended = dateOnly(task.end_date) < today;

  function open() {
    setDraft(toDraft(task));
    setEditing(true);
  }

  async function run(patch: Record<string, unknown>, close = false) {
    setSaving(true);
    try {
      await onUpdate(task.id, patch);
      if (close) setEditing(false);
    } catch {
      // The panel above already showed why; the form stays open so the
      // teacher does not lose what they typed.
    } finally {
      setSaving(false);
    }
  }

  // Extending is the thing teachers reach for most, so it is one button.
  // A task that has already finished extends from today rather than from its
  // old end date, which is what makes it live again.
  function extend(days: number) {
    const from = ended ? today : dateOnly(task.end_date);
    void run({ endDate: shiftDate(from, days) });
  }

  function toggleStudent(name: string) {
    setDraft((current) => ({
      ...current,
      assignedStudents: current.assignedStudents.some((value) => normalizeName(value) === normalizeName(name))
        ? current.assignedStudents.filter((value) => normalizeName(value) !== normalizeName(name))
        : [...current.assignedStudents, name]
    }));
  }

  if (editing) {
    return (
      <div className="daily-task-card">
        <div className="daily-task-editor">
          <div>
            <label>{t("任务标题", "Task title")}</label>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          <div>
            <label>{t("任务类型", "Task type")}</label>
            <select value={draft.taskType} onChange={(event) => setDraft({ ...draft, taskType: event.target.value })}>
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {taskTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>{t("开始日期", "Start date")}</label>
            <input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
          </div>
          <div>
            <label>{t("结束日期", "End date")}</label>
            <input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} />
          </div>
          <div className="daily-task-description">
            <label>{t("任务说明", "Task details")}</label>
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          <div className="daily-task-students">
            <label>{t("分配给学生", "Assign to students")}</label>
            <div className="student-check-list compact">
              {students.map((student) => (
                <label key={student.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={draft.assignedStudents.some((value) => normalizeName(value) === normalizeName(student.name))}
                    onChange={() => toggleStudent(student.name)}
                  />
                  <span>{student.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="daily-task-actions">
          <button className="btn" type="button" disabled={saving} onClick={() => void run(draft, true)}>
            {saving ? t("保存中...", "Saving...") : t("保存修改", "Save changes")}
          </button>
          <button className="btn secondary" type="button" disabled={saving} onClick={() => setEditing(false)}>
            {t("取消", "Cancel")}
          </button>
        </div>
        <p className="hint">
          {t("改动只影响任务本身，学生已经打过的卡不会丢。缩短日期或移除学生只是让他们看不到这项任务。", "Edits change the task only; check-ins already made are kept. Shortening the dates or removing a student just hides the task from them.")}
        </p>
      </div>
    );
  }

  return (
    <div className="daily-task-card">
      <div className="section-head compact">
        <div>
          <h3>{task.title}</h3>
          <div className="hint">{taskTypeLabel(task.task_type)}</div>
        </div>
        <div className="daily-task-badges">
          {!task.is_active && <span className="pill warn">{t("已暂停", "Paused")}</span>}
          {task.is_active && ended && <span className="pill">{t("已结束", "Ended")}</span>}
          <span className="pill">{formatDate(task.start_date)} - {formatDate(task.end_date)}</span>
        </div>
      </div>
      {task.description && <p>{task.description}</p>}
      <TaskProgress task={task} studentName={studentName} />
      <div className="daily-task-actions">
        <button className="btn secondary" type="button" disabled={saving} onClick={() => extend(7)}>
          {ended ? t("重开 7 天", "Reopen 7 days") : t("延长 7 天", "Extend 7 days")}
        </button>
        <button className="btn secondary" type="button" disabled={saving} onClick={open}>
          {t("编辑", "Edit")}
        </button>
        <button className="btn secondary" type="button" disabled={saving} onClick={() => void run({ isActive: !task.is_active })}>
          {task.is_active ? t("暂停", "Pause") : t("恢复", "Resume")}
        </button>
        <button className="btn danger" type="button" disabled={saving} onClick={() => void onDelete(task.id)}>
          {t("删除", "Delete")}
        </button>
      </div>
    </div>
  );
}

function toDraft(task: DailyTask) {
  return {
    title: task.title,
    description: task.description,
    taskType: task.task_type,
    startDate: dateOnly(task.start_date),
    endDate: dateOnly(task.end_date),
    assignedStudents: [...task.assigned_students]
  };
}

function TeacherDailyTaskCard({ task, onDelete }: { task: DailyTask; onDelete: (taskId: string) => Promise<void> }) {
  const { t } = useLanguage();
  return (
    <div className="daily-task-card">
      <div className="section-head compact">
        <div>
          <h3>{task.title}</h3>
          <div className="hint">{taskTypeLabel(task.task_type)}</div>
        </div>
        <span className="pill">{t(`${task.assigned_students.length} 位学生`, `${task.assigned_students.length} students`)}</span>
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
        {t("删除", "Delete")}
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
  const { t } = useLanguage();

  return (
    <div className="daily-calendar-card">
      <div className="section-head compact">
        <div>
          <h3>{studentName}</h3>
          <div className="hint">{t("每日打卡日历", "Check-in calendar")}</div>
        </div>
        <span className="pill ok">
          {t(`${completedDays}/${dueDays} 天已完成`, `${completedDays}/${dueDays} days done`)}
        </span>
      </div>
      {days.length ? (
        <>
          <div className="daily-calendar-weekdays">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day, index) => (
              <strong key={day}>{t(day, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index])}</strong>
            ))}
          </div>
          <div className="daily-calendar-grid">
            {Array.from({ length: firstDayOffset(days[0].date) }).map((_, index) => (
              <span className="daily-calendar-empty" key={`empty-${index}`} />
            ))}
            {days.map((day) => (
              <div className={`daily-calendar-day ${dayClass(day)}`} key={day.date}>
                <strong>{Number(day.date.slice(-2))}</strong>
                {day.due ? <span>{day.completed}/{day.due}</span> : <span>{t("无任务", "none")}</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="hint">{t("还没有给该学生分配每日任务。", "No tasks assigned to this student yet.")}</p>
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
        {tr(`${completed}/${total} 天`, `${completed}/${total} days`)}
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
  return date.toLocaleDateString(tr("zh-CN", "en-GB"));
}

/**
 * Today's check-in, small enough for the home page.
 *
 * The same data and the same check-in call as the full panel, cut down to
 * what matters this morning: how many are due, which are still open, and a
 * button on each. History and the calendar stay on the daily-tasks page.
 */
export function StudentDailyCheckinTile({
  onOpenAll
}: {
  onOpenAll: () => void;
}) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [today, setToday] = useState(todayString());
  const [message, setMessage] = useState("");
  const [loadingTaskId, setLoadingTaskId] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    void loadTasks();
  }, []);

  async function loadTasks() {
    const response = await fetch("/api/student/daily-tasks", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || tr("无法加载每日任务。", "Could not load daily tasks."));
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
      if (!response.ok) throw new Error(data.error || tr("打卡失败。", "Check-in failed."));
      await loadTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("打卡失败。", "Check-in failed."));
    } finally {
      setLoadingTaskId("");
    }
  }

  const due = tasks.filter((task) => dateOnly(task.start_date) <= today && dateOnly(task.end_date) >= today);
  const summary = getTodayTaskSummary(tasks, today);
  const allDone = summary.due > 0 && summary.completed >= summary.due;

  return (
    <article className="card stack student-home-tile">
      <div className="section-head compact">
        <div>
          <h2>{t("每日打卡", "Daily check-in")}</h2>
        </div>
        <button className="btn secondary" type="button" onClick={onOpenAll}>
          {t("全部任务", "All tasks")}
        </button>
      </div>
      {message && <p className="error">{message}</p>}
      <div className="student-home-checkin">
        <strong className={allDone ? "done" : ""}>
          {summary.completed}/{summary.due}
          <small>{allDone ? t("今天都打过了", "all done today") : summary.due ? t("今日进度", "today") : t("今天没有任务", "no tasks today")}</small>
        </strong>
        {due.length > 0 && (
          <ul className="student-home-checkin-list">
            {due.map((task) => {
              const checked = (task.checkins || []).some((checkin) => sameDate(checkin.checkin_date, today));
              return (
                <li key={task.id}>
                  <span className={checked ? "checked" : ""}>{task.title}</span>
                  <button
                    className={`btn ${checked ? "ghost" : "accent"} compact`}
                    type="button"
                    disabled={checked || loadingTaskId === task.id}
                    onClick={() => void checkIn(task.id)}
                  >
                    {checked ? t("已打卡", "Done") : loadingTaskId === task.id ? "..." : t("打卡", "Check in")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}
