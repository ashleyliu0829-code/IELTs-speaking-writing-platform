import { z } from "zod";
import { requireStudent } from "@/lib/auth";

/**
 * The student's side of a mock exam: the sittings set for them, and the
 * listening result handed back when they finish.
 *
 * The result is the paper's own grading, read out of it by the reporter the
 * upload injected — the same numbers the student sees on the tabs. It is
 * stored once per sitting and replaced if they go round again, so the teacher
 * always sees the latest attempt rather than a pile.
 */

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
      "id, title, student_name, speaking_url, writing_assignment_id, listening_name, listening_path, reading_name, reading_path, scheduled_at, created_at, writing_assignment:assignments(id, title), result:mock_exam_results(correct, total, submitted_at)"
    )
    .eq("student_account_id", account.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const one = (value: unknown) => (Array.isArray(value) ? value[0] || null : value || null);
  return Response.json({
    exams: (data || []).map((row) => ({ ...row, writing_assignment: one(row.writing_assignment), result: one(row.result) }))
  });
}

export async function POST(request: Request) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const parsed = resultSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "成绩内容不完整。" }, { status: 400 });

  // RLS lets a student reach only their own sitting; the teacher id comes
  // from the row rather than the request so the result cannot be misfiled.
  const { data: exam } = await supabase
    .from("mock_exams")
    .select("id, teacher_id")
    .eq("id", parsed.data.examId)
    .eq("student_account_id", account.id)
    .maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

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
