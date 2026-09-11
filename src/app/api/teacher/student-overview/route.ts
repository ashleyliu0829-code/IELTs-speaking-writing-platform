import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { isCoursePlan } from "@/lib/coursePlans";
import type { LessonSection, StudentOverviewLesson, StudentOverviewRow, StudentOverviewScore, StudentOverviewStats } from "@/lib/types";

/**
 * Everything the teacher wants to know about a student on one line: who they
 * are, how long they have been studying, where they currently sit in speaking
 * and writing, how far off the exam is, and when the next lesson runs.
 *
 * It is one route rather than five because the page is a table — a request per
 * column would make the page as slow as its slowest column, and every one of
 * these reads is small.
 */

type ScoreRow = {
  student_name: string;
  submitted_at: string;
  assignments: { assignment_type: string | null } | { assignment_type: string | null }[] | null;
  feedback: FeedbackRow | FeedbackRow[] | null;
};

type FeedbackRow = { overall_score: number | string | null; published_at: string | null };

type BookingRow = {
  student_name: string;
  student_account_id: string | null;
  start_at: string;
  status: string;
  booking_type: string | null;
  course_minutes: number | null;
  lesson_slots: { teacher_id: string | null } | { teacher_id: string | null }[] | null;
};

export async function GET() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const now = new Date().toISOString();
  const [students, accounts, submissions, bookings, pastBookings] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, normalized_name, phone, account_id, first_seen_at, exam_date, exam_date_confirmed, course_plan, is_active, taught_hours_override")
      .order("name", { ascending: true }),
    supabase.from("accounts").select("id, created_at, phone").eq("role", "student"),
    supabase
      .from("submissions")
      .select("student_name, submitted_at, assignments(assignment_type), feedback(overall_score, published_at)")
      .order("submitted_at", { ascending: false }),
    supabase
      .from("lesson_bookings")
      .select("student_name, student_account_id, start_at, status, booking_type, course_minutes, lesson_slots!inner(teacher_id)")
      .eq("lesson_slots.teacher_id", account.id)
      .in("status", ["pending", "confirmed"])
      .gte("start_at", now)
      .order("start_at", { ascending: true }),
    // Lessons already taught: confirmed bookings whose start has passed.
    supabase
      .from("lesson_bookings")
      .select("student_name, student_account_id, course_minutes, lesson_sections, lesson_slots!inner(teacher_id)")
      .eq("lesson_slots.teacher_id", account.id)
      .eq("status", "confirmed")
      .lt("start_at", now)
  ]);

  const failure = [students, accounts, submissions, bookings, pastBookings].find((result) => result.error);
  if (failure?.error) return Response.json({ error: failure.error.message }, { status: 500 });

  const registeredAt = new Map<string, string>();
  (accounts.data || []).forEach((row) => registeredAt.set(row.id as string, row.created_at as string));

  const latestScores = new Map<string, StudentOverviewScore>();
  ((submissions.data || []) as unknown as ScoreRow[]).forEach((row) => {
    const assignment = one(row.assignments);
    const feedback = one(row.feedback);
    if (!feedback?.published_at) return;

    // A published feedback with a zero overall is one the teacher published
    // without scoring, not a student who scored zero. Calling that a level
    // would be worse than saying nothing.
    const score = Number(feedback.overall_score || 0);
    if (!(score > 0)) return;

    const area = (assignment?.assignment_type || "speaking") === "writing" ? "writing" : "speaking";
    const key = `${normalize(row.student_name)}::${area}`;
    // The query is newest-first, so the first hit for a key is the latest.
    if (!latestScores.has(key)) latestScores.set(key, { score, submitted_at: row.submitted_at });
  });

  const nextLessonByName = new Map<string, StudentOverviewLesson>();
  const nextLessonByAccount = new Map<string, StudentOverviewLesson>();
  ((bookings.data || []) as unknown as BookingRow[]).forEach((row) => {
    const lesson: StudentOverviewLesson = {
      start_at: row.start_at,
      status: row.status === "confirmed" ? "confirmed" : "pending",
      booking_type: row.booking_type || "regular",
      course_minutes: Number(row.course_minutes || 0)
    };
    // Ordered soonest-first, so the first booking seen for a student is next.
    const nameKey = normalize(row.student_name);
    if (nameKey && !nextLessonByName.has(nameKey)) nextLessonByName.set(nameKey, lesson);
    if (row.student_account_id && !nextLessonByAccount.has(row.student_account_id)) {
      nextLessonByAccount.set(row.student_account_id, lesson);
    }
  });

  // Minutes taught, keyed both ways like the next lesson: by account when the
  // booking carries one, by name for the ones that predate accounts.
  const taughtByName = new Map<string, number>();
  const taughtByAccount = new Map<string, number>();
  // Per-student breakdown: how many lessons, and the hours by area. A lesson
  // tagged with two areas splits its time between them, so the areas add up
  // to the total rather than beyond it.
  const statsByName = new Map<string, StudentOverviewStats>();
  const statsByAccount = new Map<string, StudentOverviewStats>();
  const emptyStats = (): StudentOverviewStats => ({ lessons: 0, by_section: {} });
  ((pastBookings.data || []) as unknown as Array<Pick<BookingRow, "student_name" | "student_account_id" | "course_minutes"> & { lesson_sections?: string[] | null }>).forEach((row) => {
    const minutes = Number(row.course_minutes || 0);
    const nameKey = normalize(row.student_name);
    let stats: StudentOverviewStats;
    if (row.student_account_id) {
      taughtByAccount.set(row.student_account_id, (taughtByAccount.get(row.student_account_id) || 0) + minutes);
      stats = statsByAccount.get(row.student_account_id) || emptyStats();
      statsByAccount.set(row.student_account_id, stats);
    } else {
      taughtByName.set(nameKey, (taughtByName.get(nameKey) || 0) + minutes);
      stats = statsByName.get(nameKey) || emptyStats();
      statsByName.set(nameKey, stats);
    }
    stats.lessons += 1;
    const areas = (row.lesson_sections || []) as LessonSection[];
    const share = areas.length ? minutes / areas.length : minutes;
    for (const area of areas.length ? areas : (["Other"] as const)) {
      stats.by_section[area] = (stats.by_section[area] || 0) + share;
    }
  });
  const mergeStats = (a?: StudentOverviewStats, b?: StudentOverviewStats): StudentOverviewStats => {
    const out = emptyStats();
    for (const s of [a, b]) {
      if (!s) continue;
      out.lessons += s.lessons;
      for (const [area, mins] of Object.entries(s.by_section)) out.by_section[area as keyof typeof out.by_section] = (out.by_section[area as keyof typeof out.by_section] || 0) + mins;
    }
    // minutes -> hours, one decimal
    for (const area of Object.keys(out.by_section) as Array<keyof typeof out.by_section>) out.by_section[area] = Math.round((out.by_section[area] || 0) / 6) / 10;
    return out;
  };

  const rows: StudentOverviewRow[] = (students.data || []).map((student) => {
    const accountId = (student.account_id as string | null) || null;
    const fromAccount = accountId ? registeredAt.get(accountId) : undefined;
    const key = student.normalized_name as string;

    return {
      id: student.id as string,
      name: student.name as string,
      normalized_name: key,
      phone: (student.phone as string | null) || null,
      account_id: accountId,
      registered_at: fromAccount || (student.first_seen_at as string),
      registered_from_account: Boolean(fromAccount),
      exam_date: (student.exam_date as string | null) || null,
      exam_date_confirmed: Boolean(student.exam_date_confirmed),
      course_plan: (student.course_plan as string | null) || "",
      is_active: student.is_active !== false,
      taught_hours_auto: Math.round((((accountId ? taughtByAccount.get(accountId) : 0) || 0) + (taughtByName.get(key) || 0)) / 6) / 10,
      taught_hours_override: student.taught_hours_override == null ? null : Number(student.taught_hours_override),
      lesson_stats: mergeStats(accountId ? statsByAccount.get(accountId) : undefined, statsByName.get(key)),
      speaking: latestScores.get(`${key}::speaking`) || null,
      writing: latestScores.get(`${key}::writing`) || null,
      next_lesson:
        (accountId ? nextLessonByAccount.get(accountId) : undefined) || nextLessonByName.get(key) || null
    };
  });

  // Current students first, stopped ones after them, each group by name. The
  // sort happens here rather than in the query so the two groups stay together
  // however the page later chooses to render them.
  rows.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  return Response.json({ students: rows });
}

const editSchema = z.object({
  studentId: z.string().uuid(),
  // Null clears the date back to "not set".
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  confirmed: z.boolean(),
  // Empty string means no plan chosen.
  coursePlan: z.string().default(""),
  isActive: z.boolean().default(true),
  // Null clears the manual figure so the automatic total shows again.
  taughtHours: z.number().min(0).max(9999).nullable().default(null)
});

export async function PATCH(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "考试日期格式不正确。" }, { status: 400 });
  const { studentId, examDate, confirmed, coursePlan, isActive, taughtHours } = parsed.data;

  // The picker offers a fixed list, so anything else arrived from somewhere
  // that is not the picker, and is not written.
  if (coursePlan && !isCoursePlan(coursePlan)) {
    return Response.json({ error: "课程计划不在可选范围内。" }, { status: 400 });
  }

  // RLS keeps this inside the teacher's own workspace, so a student id from
  // another teacher matches no row rather than updating theirs.
  const { data, error } = await supabase
    .from("students")
    .update({
      exam_date: examDate,
      exam_date_confirmed: examDate ? confirmed : false,
      course_plan: coursePlan,
      is_active: isActive,
      taught_hours_override: taughtHours
    })
    .eq("id", studentId)
    .select("id, exam_date, exam_date_confirmed, course_plan, is_active, taught_hours_override")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "找不到这个学生。" }, { status: 404 });
  return Response.json({ student: data });
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalize(value: string) {
  return (value || "").trim().toLowerCase();
}
