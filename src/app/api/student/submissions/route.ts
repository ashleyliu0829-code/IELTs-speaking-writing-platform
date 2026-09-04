import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { signRecordingUrl } from "@/lib/recordingUrls";
import { upsertStudentProfile } from "@/lib/students";
import { attachTeacherDemos } from "@/lib/teacherDemos";
import type { Assignment, Recording, Submission } from "@/lib/types";

const payloadSchema = z.object({
  assignmentId: z.string().uuid(),
  studentName: z.string().min(1),
  create: z.boolean().optional()
});

const submitSchema = z.object({
  assignmentId: z.string().uuid(),
  submissionId: z.string().uuid(),
  studentName: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;
  const storage = getSupabaseAdmin();

  const payload = payloadSchema.parse(await request.json());
  const studentName = payload.studentName.trim();
  // The profile is written with the service role, so the name has to come from
  // the session rather than the request: a caller-supplied one could create a
  // student in the teacher's roster, or overwrite a classmate's row through the
  // (teacher_id, normalized_name) upsert.

  await upsertStudentProfile(account.display_name, { accountId: account.id, phone: account.phone, teacherId: account.teacher_id }).catch((error) => console.error("Student profile save failed:", error));

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, assigned_students")
    .eq("id", payload.assignmentId)
    .eq("is_active", true)
    .maybeSingle<Pick<Assignment, "id" | "title" | "assigned_students">>();

  if (!assignment) {
    return Response.json({ error: "Assignment not found." }, { status: 404 });
  }

  if (!canStudentSubmit(studentName, assignment.assigned_students || [])) {
    return Response.json({ error: "This homework is not assigned to this student name." }, { status: 403 });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("submissions")
    .select("*, recordings(*), writing_responses(*), feedback(*)")
    .eq("assignment_id", payload.assignmentId)
    .ilike("student_name", studentName)
    .order("submitted_at", { ascending: false })
    .limit(10);

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }

  // RLS already limited these to the caller's workspace.
  let submission = ((existingRows || []) as Submission[])[0];
  if (!submission && payload.create) {
    const { data: created, error } = await supabase
      .from("submissions")
      .insert({
        assignment_id: payload.assignmentId,
        student_name: studentName,
        submission_title: assignment.title,
        teacher_id: account.teacher_id,
        submission_status: "in_progress"
      })
      .select("*, recordings(*), writing_responses(*), feedback(*)")
      .single<Submission>();

    if (error || !created) {
      return Response.json({ error: error?.message || "Could not create submission." }, { status: 500 });
    }
    submission = created;
  }

  if (!submission) {
    return Response.json({ submissionId: "", recordings: [] });
  }

  const recordings = await Promise.all(
    (submission.recordings || []).map(async (recording: Recording) => ({
      ...recording,
      signed_url: await signRecordingUrl(storage, recordingsBucket, recording.storage_path)
    }))
  );

  const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null;
  const publishedFeedback = feedback?.published_at ? feedback : null;

  return Response.json({
    submissionId: submission.id,
    submissionStatus: submission.submission_status || "submitted",
    recordings: await attachTeacherDemos(storage, recordings),
    writingResponses: submission.writing_responses || [],
    feedback: publishedFeedback
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const payload = submitSchema.parse(await request.json());
  const studentName = payload.studentName.trim();
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("id, teacher_id, recordings(id), writing_responses(id)")
    .eq("id", payload.submissionId)
    .eq("assignment_id", payload.assignmentId)
    .ilike("student_name", studentName)
    .maybeSingle<Submission>();

  if (submissionError) return Response.json({ error: submissionError.message }, { status: 500 });
  if (!submission) {
    return Response.json({ error: "没有找到这份已保存的作业。" }, { status: 404 });
  }
  if (!submission.recordings?.length && !submission.writing_responses?.length) {
    return Response.json({ error: "请先保存至少一段录音或一项写作后再提交。" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("submissions")
    .update({
      submission_status: "submitted",
      teacher_id: account.teacher_id || submission.teacher_id || null,
      submitted_at: new Date().toISOString()
    })
    .eq("id", payload.submissionId)
    .select("id, submission_status")
    .single();

  if (error || !updated) return Response.json({ error: error?.message || "提交失败。" }, { status: 500 });
  return Response.json({ submissionId: payload.submissionId, submissionStatus: updated.submission_status });
}

function canStudentSubmit(studentName: string, assignedStudents: string[]) {
  if (!assignedStudents.length) return true;
  const normalizedStudent = normalizeStudentName(studentName);
  return assignedStudents.some((student) => normalizeStudentName(student) === normalizedStudent);
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}
