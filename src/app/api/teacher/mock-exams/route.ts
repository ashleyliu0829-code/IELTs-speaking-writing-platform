import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
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
  isActive: z.boolean().optional()
});

const columns =
  "id, teacher_id, title, student_name, student_account_id, speaking_url, writing_assignment_id, listening_name, listening_path, listening_audio, reading_name, reading_path, scheduled_at, is_active, created_at";

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const studentName = request.nextUrl.searchParams.get("studentName");
  let query = supabase
    .from("mock_exams")
    .select(`${columns}, writing_assignment:assignments(id, title), result:mock_exam_results(*)`)
    .order("created_at", { ascending: false });
  if (studentName) query = query.ilike("student_name", studentName.trim());

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ exams: (data || []).map(flatten) });
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
      student_account_id: profile?.account_id || null
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

  const { data, error } = await supabase.from("mock_exams").update(patch).eq("id", examId).select(columns).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "找不到这场模考。" }, { status: 404 });
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
    .select("id, listening_path, listening_audio, reading_path")
    .eq("id", parsed.data.examId)
    .maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  // The rows cascade; the files in storage do not.
  const paths = [exam.listening_path, exam.reading_path, ...Object.values(exam.listening_audio || {})].filter(Boolean) as string[];
  if (paths.length) {
    const { error: storageError } = await getSupabaseAdmin().storage.from(mockExamBucket).remove(paths);
    if (storageError) console.error("mock-exams: leftover files", storageError.message);
  }

  const { error } = await supabase.from("mock_exams").delete().eq("id", parsed.data.examId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ removed: true });
}

/** Supabase returns embedded rows as arrays; the page wants one or none. */
function flatten(row: Record<string, unknown>) {
  const one = (value: unknown) => (Array.isArray(value) ? value[0] || null : value || null);
  return { ...row, writing_assignment: one(row.writing_assignment), result: one(row.result) };
}
