import { getSupabaseAdmin } from "@/lib/supabase";
import { gradeReading, isPastReadingGrace, readReadingTimer } from "@/lib/readingSheet";

/**
 * Handing in the reading, and handing it in on the student's behalf when the
 * clock has run out without them.
 *
 * The marking runs here rather than in the page because the key must not
 * reach the browser; what goes back is the verdict. And because it runs here,
 * the same code can close a sitting the student walked away from — their
 * saved answers are marked exactly as if they had pressed the button.
 */

export type ExamForMarking = {
  id: string;
  teacher_id: string;
  reading_key?: unknown;
  reading_started_at?: string | null;
  reading_minutes?: number | null;
  reading_draft?: unknown;
};

export async function storeReadingResult(exam: ExamForMarking, answers: string[]) {
  const keys = (Array.isArray(exam.reading_key) ? exam.reading_key : []) as string[];
  const grade = gradeReading(keys, answers);

  const { data, error } = await getSupabaseAdmin()
    .from("mock_exam_results")
    .upsert(
      {
        exam_id: exam.id,
        teacher_id: exam.teacher_id,
        part: "reading",
        correct: grade.correct,
        total: grade.total,
        detail: grade.detail,
        submitted_at: new Date().toISOString()
      },
      { onConflict: "exam_id,part" }
    )
    .select("correct, total, detail, submitted_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Marks any sitting whose reading clock has run out and that was never handed
 * in. Called when either side loads their page, which is enough: the result
 * has to exist by the time somebody looks at it, not the instant it expires.
 */
export async function closeExpiredReading(exams: Record<string, unknown>[]) {
  const stale = exams.filter((exam) => {
    if (exam.reading_result) return false;
    const timer = readReadingTimer(Number(exam.reading_minutes) || 0, (exam.reading_started_at as string) || null);
    return timer.expired && isPastReadingGrace(timer);
  });
  if (!stale.length) return exams;

  // The key is fetched here rather than taken from the caller's rows: the
  // student's side never selects it, and this must work from either side.
  const { data: rows } = await getSupabaseAdmin()
    .from("mock_exams")
    .select("id, teacher_id, reading_key, reading_draft")
    .in(
      "id",
      stale.map((exam) => exam.id as string)
    );

  await Promise.all(
    (rows || []).map(async (row) => {
      const draft = (Array.isArray(row.reading_draft) ? row.reading_draft : []) as string[];
      try {
        const result = await storeReadingResult(row as ExamForMarking, draft);
        const exam = stale.find((item) => item.id === row.id);
        if (exam) exam.reading_result = { part: "reading", ...result };
      } catch (problem) {
        console.error("mock-exams: could not close an expired reading", problem);
      }
    })
  );
  return exams;
}
