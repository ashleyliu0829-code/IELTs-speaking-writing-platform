import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { closeExpiredReading, storeReadingResult, type ExamForMarking } from "@/lib/readingExam";
import { readReadingTimer } from "@/lib/readingSheet";
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

/**
 * The reading clock, the answer sheet as it is being filled in, and handing
 * it in. Starting is a separate call because it happens when the student
 * opens the first paper, not when the page loads — a sitting they look at the
 * day before must not already be running.
 */
const readingStartSchema = z.object({
  examId: z.string().uuid(),
  action: z.literal("reading-start")
});

const readingAnswersSchema = z.object({
  examId: z.string().uuid(),
  action: z.enum(["reading-save", "reading-submit"]),
  answers: z.array(z.string().trim().max(200)).max(60),
  // Which questions they flagged to come back to, and what they highlighted.
  // Both travel with the answers so one save covers the whole paper.
  flags: z.array(z.number().int().min(1).max(60)).max(60).optional(),
  // What they drew on the paper: one entry per stroke, its points held as
  // fractions of the page so a line lands on the same words at any zoom.
  marks: z
    .array(
      z.object({
        id: z.string().max(40),
        page: z.number().int().min(1).max(200),
        // The two views are separate papers, so a stroke says which it is on.
        side: z.enum(["left", "right"]).optional(),
        color: z.string().max(20).optional(),
        width: z.number().min(0.1).max(20).optional(),
        points: z.array(z.tuple([z.number(), z.number()])).max(4000)
      })
    )
    .max(2000)
    .optional()
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
      "id, title, student_name, speaking_url, writing_assignment_id, listening_name, listening_path, reading_name, reading_path, reading_answer_name, reading_answer_path, reading_key, reading_started_at, reading_minutes, reading_draft, reading_flags, reading_marks, scheduled_at, completed_at, created_at, writing_assignment:assignments(id, title), result:mock_exam_results(part, correct, total, detail, submitted_at), scores:mock_exam_scores(part, criteria, band, comment, published_at)"
    )
    .eq("student_account_id", account.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const one = (value: unknown) => (Array.isArray(value) ? value[0] || null : value || null);
  const exams: Record<string, unknown>[] = (data || []).map((row) => {
    const results = (Array.isArray(row.result) ? row.result : row.result ? [row.result] : []) as { part?: string }[];
    // The sheet needs to know how many questions there are. That is all it
    // gets: the key itself is dropped here and never reaches the browser.
    const { reading_key: key, ...rest } = row as Record<string, unknown> & { reading_key?: unknown };
    return {
      ...rest,
      reading_total: Array.isArray(key) ? key.length : 0,
      writing_assignment: one(row.writing_assignment),
      result: results.find((entry) => (entry.part || "listening") === "listening") || null,
      speaking_score: ((Array.isArray(row.scores) ? row.scores : row.scores ? [row.scores] : []) as { part?: string }[]).find((entry) => entry.part === "speaking") || null,
      reading_result: results.find((entry) => entry.part === "reading") || null
    };
  });

  // A sitting whose clock ran out without the student pressing anything is
  // marked here, from what they had saved.
  await closeExpiredReading(exams);
  for (const exam of exams) {
    exam.reading_timer = readReadingTimer(Number(exam.reading_minutes) || 0, (exam.reading_started_at as string) || null);
  }

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
    .select("id, teacher_id, reading_started_at, reading_minutes")
    .eq("id", examId)
    .eq("student_account_id", account.id)
    .maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  const start = readingStartSchema.safeParse(payload);
  if (start.success) {
    // Written once. A reload, a second tab or coming back tomorrow must not
    // hand time back, so an existing start is returned untouched.
    if (exam.reading_started_at) {
      return Response.json({ startedAt: exam.reading_started_at, minutes: exam.reading_minutes || 0 });
    }
    const { data, error } = await getSupabaseAdmin()
      .from("mock_exams")
      .update({ reading_started_at: new Date().toISOString() })
      .eq("id", exam.id)
      .eq("student_account_id", account.id)
      .is("reading_started_at", null)
      .select("reading_started_at, reading_minutes")
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (data) return Response.json({ startedAt: data.reading_started_at, minutes: data.reading_minutes || 0 });
    // Lost a race with another tab; whichever start won is the real one.
    const { data: again } = await supabase.from("mock_exams").select("reading_started_at, reading_minutes").eq("id", exam.id).maybeSingle();
    return Response.json({ startedAt: again?.reading_started_at || null, minutes: again?.reading_minutes || 0 });
  }

  const reading = readingAnswersSchema.safeParse(payload);
  if (reading.success) {
    const { data: existing } = await supabase
      .from("mock_exam_results")
      .select("correct, total, submitted_at")
      .eq("exam_id", exam.id)
      .eq("part", "reading")
      .maybeSingle();
    // Once it is marked the score is on screen, so it cannot be redone.
    if (existing) return Response.json({ error: "这份阅读已经提交过了。", result: existing }, { status: 409 });

    // The sheet is saved on every pass, including the one that hands it in,
    // so a submission that fails halfway still leaves the answers behind.
    const draft: Record<string, unknown> = { reading_draft: reading.data.answers };
    if (reading.data.flags) draft.reading_flags = reading.data.flags;
    if (reading.data.marks) draft.reading_marks = reading.data.marks;
    const { error: saveError } = await getSupabaseAdmin()
      .from("mock_exams")
      .update(draft)
      .eq("id", exam.id)
      .eq("student_account_id", account.id);
    if (saveError) return Response.json({ error: saveError.message }, { status: 500 });
    if (reading.data.action === "reading-save") return Response.json({ saved: true });

    // Marking needs the key, which the student's own client may never read.
    const { data: full } = await getSupabaseAdmin().from("mock_exams").select("id, teacher_id, reading_key").eq("id", exam.id).single();
    try {
      const result = await storeReadingResult(full as ExamForMarking, reading.data.answers);
      return Response.json({ result });
    } catch (problem) {
      return Response.json({ error: problem instanceof Error ? problem.message : "提交失败。" }, { status: 500 });
    }
  }

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
