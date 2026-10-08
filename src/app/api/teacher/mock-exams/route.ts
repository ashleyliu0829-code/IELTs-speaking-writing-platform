import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { closeExpiredReading, storeReadingResult, type ExamForMarking } from "@/lib/readingExam";
import { readReadingTimer } from "@/lib/readingSheet";
import { getSupabaseAdmin, mockExamBucket } from "@/lib/supabase";

/**
 * The teacher's mock exams: one sitting per student, built up part by part.
 *
 * A sitting is created first and filled in afterwards, because the parts
 * arrive at different times — the meeting link is pasted the morning of, the
 * papers are uploaded whenever they are ready. So every field is optional on
 * update, and the student simply sees whichever parts are present.
 */

const createSchema = z.object({
  title: z.string().trim().max(120).default(""),
  studentName: z.string().trim().min(1)
});

const updateSchema = z.object({
  examId: z.string().uuid(),
  title: z.string().trim().max(120).optional(),
  speakingUrl: z.string().trim().max(600).optional(),
  writingAssignmentId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  // The answer key in question order, as typed. Blank entries are questions
  // the paper does not have.
  readingKey: z.array(z.string().trim().max(120)).max(60).optional(),
  // Mark the sheet again against the key as it now stands.
  remarkReading: z.boolean().optional()
});

const columns =
  "id, teacher_id, title, student_name, student_account_id, speaking_url, writing_assignment_id, listening_name, listening_path, listening_audio, reading_name, reading_path, reading_answer_name, reading_answer_path, reading_key, reading_started_at, reading_minutes, reading_draft, scheduled_at, completed_at, is_active, created_at";

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const studentName = request.nextUrl.searchParams.get("studentName");
  let query = supabase
    .from("mock_exams")
    .select(`${columns}, writing_assignment:assignments(id, title), result:mock_exam_results(*), scores:mock_exam_scores(part, criteria, band, comment, published_at, updated_at)`)
    .order("created_at", { ascending: false });
  if (studentName) query = query.ilike("student_name", studentName.trim());

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The essay goes with the sitting, so the teacher reads it here rather than
  // hunting for it in the marking list.
  const exams: Record<string, unknown>[] = (data || []).map(flatten);
  // A reading whose clock ran out without the student handing in is marked
  // here too, so the teacher is not waiting on a result that will never come.
  await closeExpiredReading(exams);
  for (const exam of exams) {
    exam.reading_timer = readReadingTimer(Number(exam.reading_minutes) || 0, (exam.reading_started_at as string) || null);
  }
  await Promise.all(exams.map((exam) => attachWriting(supabase, exam)));
  return Response.json({ exams });
}

export async function POST(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "请选择学生。" }, { status: 400 });

  // The account is what the student's own side matches on; a student the
  // teacher typed in by hand simply has none yet, and the sitting waits.
  const { data: profile } = await supabase
    .from("students")
    .select("account_id")
    .ilike("name", parsed.data.studentName)
    .maybeSingle();

  const { data, error } = await supabase
    .from("mock_exams")
    .insert({
      teacher_id: teacher.id,
      title: parsed.data.title || `模考 · ${parsed.data.studentName}`,
      student_name: parsed.data.studentName,
      student_account_id: profile?.account_id || null,
      // Unpublished until the teacher presses publish.
      is_active: false
    })
    .select(columns)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ exam: flatten(data) });
}

export async function PATCH(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { examId, ...fields } = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.speakingUrl !== undefined) patch.speaking_url = fields.speakingUrl;
  if (fields.writingAssignmentId !== undefined) patch.writing_assignment_id = fields.writingAssignmentId;
  if (fields.scheduledAt !== undefined) patch.scheduled_at = fields.scheduledAt || null;
  if (fields.isActive !== undefined) patch.is_active = fields.isActive;
  if (fields.readingKey !== undefined) patch.reading_key = fields.readingKey;

  const { data, error } = await supabase.from("mock_exams").update(patch).eq("id", examId).select(columns).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  // Marking again is for a key that was wrong when the sheet came in — a
  // typo, or a paper keyed from the wrong test. The student cannot hand in
  // twice, so without this a mis-keyed exam would stay mis-marked for ever.
  // Their answers are untouched; only the verdict is worked out afresh.
  if (fields.remarkReading) {
    const { data: result } = await supabase
      .from("mock_exam_results")
      .select("exam_id")
      .eq("exam_id", examId)
      .eq("part", "reading")
      .maybeSingle();
    if (!result) return Response.json({ error: "这份阅读还没有提交，没有可以重判的内容。" }, { status: 400 });
    try {
      const fresh = await storeReadingResult(data as unknown as ExamForMarking, (data.reading_draft || []) as string[]);
      return Response.json({ exam: { ...flatten(data), reading_result: { part: "reading", ...fresh } } });
    } catch (problem) {
      return Response.json({ error: problem instanceof Error ? problem.message : "重判失败。" }, { status: 500 });
    }
  }

  return Response.json({ exam: flatten(data) });
}

export async function DELETE(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const parsed = z.object({ examId: z.string().uuid() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const { data: exam } = await supabase
    .from("mock_exams")
    .select("id, listening_path, listening_audio, reading_path, reading_answer_path")
    .eq("id", parsed.data.examId)
    .maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  // The rows cascade; the files in storage do not.
  const paths = [
    exam.listening_path,
    exam.reading_path,
    exam.reading_answer_path,
    ...Object.values(exam.listening_audio || {})
  ].filter(Boolean) as string[];
  if (paths.length) {
    const { error: storageError } = await getSupabaseAdmin().storage.from(mockExamBucket).remove(paths);
    if (storageError) console.error("mock-exams: leftover files", storageError.message);
  }

  const { error } = await supabase.from("mock_exams").delete().eq("id", parsed.data.examId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ removed: true });
}

/**
 * Supabase returns embedded rows as arrays; the page wants one or none.
 *
 * There are now two results per sitting — the listening paper's own marking
 * and the reading answer sheet — so they are handed over separately rather
 * than as whichever row came back first.
 */
function flatten(row: Record<string, unknown>): Record<string, unknown> {
  const one = (value: unknown) => (Array.isArray(value) ? value[0] || null : value || null);
  const results = (Array.isArray(row.result) ? row.result : row.result ? [row.result] : []) as { part?: string }[];
  return {
    ...row,
    writing_assignment: one(row.writing_assignment),
    result: results.find((entry) => (entry.part || "listening") === "listening") || null,
    speaking_score: ((Array.isArray(row.scores) ? row.scores : row.scores ? [row.scores] : []) as { part?: string }[]).find((entry) => entry.part === "speaking") || null,
    reading_result: results.find((entry) => entry.part === "reading") || null
  };
}

/** The student's essay for the linked homework, and whether it has been marked. */
async function attachWriting(supabase: SupabaseClient, exam: Record<string, unknown>) {
  const assignmentId = exam.writing_assignment_id as string | null;
  if (!assignmentId) return;
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, submission_status, writing_responses(task_label, response_text), feedback(overall_score, overall_comment, published_at)")
    .eq("assignment_id", assignmentId)
    .ilike("student_name", exam.student_name as string)
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
    comment: feedback?.published_at ? feedback.overall_comment || "" : "",
    responses: submission.writing_responses || []
  };
}
