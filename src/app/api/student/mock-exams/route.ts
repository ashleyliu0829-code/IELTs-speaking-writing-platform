import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * The student's side of a mock exam: the sittings set for them, and the
 * listening result handed back when they finish.
 *
 * The result is the paper's own grading, read out of it by the reporter the
 * upload injected — the same numbers the student sees on the tabs. It is
 * stored once per sitting and replaced if they go round again, so the teacher
 * always sees the latest attempt rather than a pile.
 */

/**
 * Marking the whole sitting done. Only the student can know: the platform
 * sees the listening and nothing else, and this is also what turns their
 * page from a paper into a results page.
 */
const completeSchema = z.object({
  examId: z.string().uuid(),
  action: z.literal("complete"),
  completed: z.boolean().default(true)
});

const resultSchema = z.object({
  examId: z.string().uuid(),
  correct: z.number().int().min(0).max(200),
  total: z.number().int().min(0).max(200),
  detail: z
    .array(
      z.object({
        part: z.string().max(40),
        questions: z
          .array(
            z.object({
              question: z.string().max(20),
              answer: z.string().max(400),
              correct: z.boolean()
            })
          )
          .max(100)
      })
    )
    .max(10)
});

export async function GET() {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const { data, error } = await supabase
    .from("mock_exams")
    .select(
      "id, title, student_name, speaking_url, writing_assignment_id, listening_name, listening_path, reading_name, reading_path, reading_answer_name, reading_answer_path, scheduled_at, completed_at, created_at, writing_assignment:assignments(id, title), result:mock_exam_results(correct, total, detail, submitted_at)"
    )
    .eq("student_account_id", account.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const one = (value: unknown) => (Array.isArray(value) ? value[0] || null : value || null);
  const exams: Record<string, unknown>[] = (data || []).map((row) => ({
    ...row,
    writing_assignment: one(row.writing_assignment),
    result: one(row.result)
  }));

  // Their own essay for the linked homework, so the results page can say
  // whether it has been marked without sending them off to look.
  await Promise.all(
    exams.map(async (exam) => {
      const assignmentId = exam.writing_assignment_id as string | null;
      if (!assignmentId) return;
      const { data: submission } = await supabase
        .from("submissions")
        .select("id, submission_status, feedback(overall_score, overall_comment, published_at)")
        .eq("assignment_id", assignmentId)
        .ilike("student_name", account.display_name)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!submission) return;
      const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] : submission.feedback;
      exam.writing = {
        submission_id: submission.id,
        status: submission.submission_status,
        marked: Boolean(feedback?.published_at),
        score: feedback?.published_at ? feedback.overall_score : null,
        comment: feedback?.published_at ? feedback.overall_comment || "" : ""
      };
    })
  );

  return Response.json({ exams });
}

export async function POST(request: Request) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const payload = await request.json().catch(() => ({}));

  // RLS lets a student reach only their own sitting; the teacher id comes
  // from the row rather than the request so nothing can be misfiled.
  const examId = typeof payload?.examId === "string" ? payload.examId : "";
  const { data: exam } = await supabase
    .from("mock_exams")
    .select("id, teacher_id")
    .eq("id", examId)
    .eq("student_account_id", account.id)
    .maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  const complete = completeSchema.safeParse(payload);
  if (complete.success) {
    // A student may read their sitting but not write to it — the sitting is
    // the teacher's. Finishing is the one thing they do own, so it goes
    // through the admin client, pinned to the row already matched above as
    // theirs, and touches nothing but this column.
    const { data, error } = await getSupabaseAdmin()
      .from("mock_exams")
      .update({ completed_at: complete.data.completed ? new Date().toISOString() : null })
      .eq("id", exam.id)
      .eq("student_account_id", account.id)
      .select("completed_at")
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "找不到这场模考。" }, { status: 404 });
    return Response.json({ completedAt: data.completed_at });
  }

  const parsed = resultSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "成绩内容不完整。" }, { status: 400 });

  const { data, error } = await supabase
    .from("mock_exam_results")
    .upsert(
      {
        exam_id: exam.id,
        teacher_id: exam.teacher_id,
        part: "listening",
        correct: parsed.data.correct,
        total: parsed.data.total,
        detail: parsed.data.detail,
        submitted_at: new Date().toISOString()
      },
      { onConflict: "exam_id,part" }
    )
    .select("correct, total, submitted_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ result: data });
}
