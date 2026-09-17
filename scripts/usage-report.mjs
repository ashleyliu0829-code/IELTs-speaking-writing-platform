#!/usr/bin/env node
//
// Who is using the platform, per teacher: students, assignments, submissions,
// grading, lessons, last activity.  Read-only, service role.
//
//   node scripts/usage-report.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const all = async (table, select) => {
  const { data, error } = await sb.from(table).select(select).limit(10000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
};

const [accounts, sessions, students, assignments, submissions, feedback, rawBookings, tasks, checkins, practice, todos, aiRows] = await Promise.all([
  all("accounts", "id, role, phone, display_name, teacher_id, created_at, activated_at, ai_enabled"),
  all("account_sessions", "account_id, created_at"),
  all("students", "id, teacher_id, name, is_active"),
  all("assignments", "id, teacher_id, assignment_type, created_at"),
  all("submissions", "id, teacher_id, student_name, submitted_at"),
  all("feedback", "submission_id, published_at"),
  all("lesson_bookings", "id, status, start_at, lesson_slots(teacher_id)"),
  all("daily_tasks", "id, teacher_id, created_at"),
  all("daily_task_checkins", "id, task_id"),
  all("speaking_practice_submissions", "id, teacher_id, created_at"),
  all("teacher_todos", "id, teacher_id"),
  all("ai_assessments", "id, teacher_id, created_at")
]);

const bookings = rawBookings.map((b) => ({ ...b, teacher_id: b.lesson_slots?.teacher_id }));
const teachers = accounts.filter((a) => a.role === "teacher");
const studentAccounts = accounts.filter((a) => a.role === "student");
const subById = new Map(submissions.map((s) => [s.id, s]));
const last = (dates) => dates.filter(Boolean).sort().at(-1);
const day = (iso) => (iso ? iso.slice(0, 10) : "-");
const now = Date.now();

const rows = teachers.map((t) => {
  const mine = (list) => list.filter((x) => x.teacher_id === t.id);
  const subs = mine(submissions);
  const graded = feedback.filter((f) => f.published_at && subById.get(f.submission_id)?.teacher_id === t.id);
  const logins = sessions.filter((s) => s.account_id === t.id);
  const studentLogins = sessions.filter((s) => studentAccounts.some((a) => a.id === s.account_id && a.teacher_id === t.id));
  const active = [
    ...logins.map((s) => s.created_at),
    ...subs.map((s) => s.submitted_at),
    ...mine(assignments).map((a) => a.created_at),
    ...mine(bookings).map((b) => b.start_at).filter((d) => new Date(d).getTime() < now)
  ];
  return {
    name: t.display_name || "-",
    phone: t.phone,
    joined: day(t.created_at || t.activated_at),
    lastActive: day(last(active)),
    logins: logins.length,
    students: mine(students).filter((s) => s.is_active !== false).length,
    studentAccts: studentAccounts.filter((a) => a.teacher_id === t.id).length,
    studentLogins: studentLogins.length,
    assignments: mine(assignments).length,
    submissions: subs.length,
    graded: graded.length,
    lessons: mine(bookings).filter((b) => b.status !== "cancelled").length,
    tasks: mine(tasks).length,
    practice: mine(practice).length,
    ai: mine(aiRows).length + (t.ai_enabled ? "★" : "")
  };
});

rows.sort((a, b) => (b.submissions - a.submissions) || (b.assignments - a.assignments) || (b.logins - a.logins));

const cols = [
  ["老师", "name", 12], ["手机", "phone", 15], ["注册", "joined", 10], ["最近活跃", "lastActive", 10], ["登录", "logins", 4],
  ["学生", "students", 4], ["学生账号", "studentAccts", 8], ["学生登录", "studentLogins", 8], ["作业", "assignments", 4], ["提交", "submissions", 4],
  ["已批", "graded", 4], ["课程", "lessons", 4], ["任务", "tasks", 4], ["练习", "practice", 4], ["AI", "ai", 4]
];
const pad = (s, w) => { const str = String(s); const width = [...str].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0); return str + " ".repeat(Math.max(0, w - width)); };
console.log(cols.map(([h, , w]) => pad(h, w)).join(" "));
for (const r of rows) console.log(cols.map(([, k, w]) => pad(r[k], w)).join(" "));

const activeTeachers = rows.filter((r) => r.submissions > 0 || r.assignments > 0);
console.log(`\n老师账号 ${teachers.length}，有作业/提交的 ${activeTeachers.length}；学生账号 ${studentAccounts.length}；提交总数 ${submissions.length}，已批 ${feedback.filter((f) => f.published_at).length}；AI 初评 ${aiRows.length} 次`);
const days7 = new Date(now - 7 * 864e5).toISOString();
console.log(`近 7 天：登录 ${sessions.filter((s) => s.created_at > days7).length} 次，提交 ${submissions.filter((s) => s.submitted_at > days7).length} 份，新老师 ${teachers.filter((t) => (t.created_at || "") > days7).length}，新学生账号 ${studentAccounts.filter((a) => (a.created_at || "") > days7).length}`);
