import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * What the student's home page shows beyond the notifications it already
 * builds client-side: when their next lesson is, and when their exam is.
 *
 * Both come from rows the student can already read under RLS — their own
 * bookings and their own profile row — so this route only picks the one
 * booking that matters and passes the exam fields through.
 */

type BookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  booking_type: string | null;
  course_minutes: number | null;
};

export async function GET() {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const now = new Date().toISOString();
  const [bookings, profile] = await Promise.all([
    supabase
      .from("lesson_bookings")
      .select("id, start_at, end_at, status, booking_type, course_minutes")
      .eq("student_account_id", account.id)
      .in("status", ["pending", "confirmed"])
      .gte("start_at", now)
      .order("start_at", { ascending: true })
      .limit(3),
    supabase
      .from("students")
      .select("exam_date, exam_date_confirmed, course_plan")
      .eq("account_id", account.id)
      .maybeSingle()
  ]);

  if (bookings.error) return Response.json({ error: bookings.error.message }, { status: 500 });
  if (profile.error) return Response.json({ error: profile.error.message }, { status: 500 });

  const lessons = ((bookings.data || []) as BookingRow[]).map((row) => ({
    id: row.id,
    start_at: row.start_at,
    end_at: row.end_at,
    status: row.status === "confirmed" ? "confirmed" : "pending",
    booking_type: row.booking_type || "regular",
    course_minutes: Number(row.course_minutes || 0)
  }));

  return Response.json({
    lessons,
    exam_date: (profile.data?.exam_date as string | null) || null,
    exam_date_confirmed: Boolean(profile.data?.exam_date_confirmed),
    course_plan: (profile.data?.course_plan as string | null) || ""
  });
}

const examSchema = z.object({
  // Null clears the date back to "not set".
  examDate: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).nullable(),
  confirmed: z.boolean()
});

/**
 * The student sets their own exam date.
 *
 * RLS lets a student read their profile row but not write it — the roster is
 * the teacher's — so this goes through the admin client, pinned to the one
 * row whose account_id is the session's own and whose teacher_id matches. A
 * student cannot reach any row but theirs, and only these two columns move.
 */
export async function PATCH(request: Request) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account } = auth;

  const parsed = examSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "考试日期格式不正确。" }, { status: 400 });
  const { examDate, confirmed } = parsed.data;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("students")
    .update({ exam_date: examDate, exam_date_confirmed: examDate ? confirmed : false })
    .eq("account_id", account.id)
    .eq("teacher_id", account.teacher_id ?? "")
    .select("exam_date, exam_date_confirmed")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "找不到你的学生档案，请先登录后提交一次作业。" }, { status: 404 });
  return Response.json({ exam_date: data.exam_date, exam_date_confirmed: Boolean(data.exam_date_confirmed) });
}
