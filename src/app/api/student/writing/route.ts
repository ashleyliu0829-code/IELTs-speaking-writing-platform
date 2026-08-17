import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { upsertStudentProfile } from "@/lib/students";

const responseSchema = z.object({
  taskKey: z.string().min(1),
  taskLabel: z.string().min(1),
  taskTitle: z.string().min(1),
  taskPrompt: z.string().default(""),
  responseText: z.string().min(1)
});

const payloadSchema = z.object({
  assignmentId: z.string().uuid(),
  submissionId: z.preprocess(
    (value) => (value === "null" || value === "undefined" || value === null ? "" : value),
    z.union([z.string().uuid(), z.literal("")]).optional()
  ),
  studentName: z.string().min(1),
  mode: z.enum(["save", "submit"]).default("save"),
  responses: z.array(responseSchema).min(1)
});

export async function POST(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const payload = payloadSchema.parse(await request.json());
  const studentName = payload.studentName.trim();
  await upsertStudentProfile(studentName, { accountId: account.id, phone: account.phone, teacherId: account.teacher_id }).catch((error) => console.error("Student profile save failed:", error));

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, assigned_students")
    .eq("id", payload.assignmentId)
    .eq("is_active", true)
    .maybeSingle();

  if (!assignment) {
    return Response.json({ error: "Assignment not found." }, { status: 404 });
  }
  if (!canStudentSubmit(studentName, assignment.assigned_students || [])) {
    return Response.json({ error: "This homework is not assigned to this student name." }, { status: 403 });
  }

  let submission = null as { id: string; submission_status?: string | null } | null;
  if (payload.submissionId) {
    const { data: existing, error } = await supabase
      .from("submissions")
      .select("id, submission_status")
      .eq("id", payload.submissionId)
      .eq("assignment_id", payload.assignmentId)
      .ilike("student_name", studentName)
      .maybeSingle();

    if (!error && existing) {
      submission = existing;
    }
  } else {
    const { data: existing } = await supabase
      .from("submissions")
      .select("id, submission_status")
      .eq("assignment_id", payload.assignmentId)
      .ilike("student_name", studentName)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    submission = existing;
  }

  if (!submission) {
    const { data: created, error } = await supabase
      .from("submissions")
      .insert({
        assignment_id: payload.assignmentId,
        student_name: studentName,
        submission_title: assignment.title,
        teacher_id: account.teacher_id,
        submission_status: payload.mode === "submit" ? "submitted" : "in_progress"
      })
      .select("id")
      .single();

    if (error || !created) {
      return Response.json({ error: error?.message || "Could not create submission." }, { status: 500 });
    }
    submission = created;
  }

  const rows = payload.responses.map((response) => ({
    submission_id: submission.id,
    task_key: response.taskKey,
    task_label: response.taskLabel,
    task_title: response.taskTitle,
    task_prompt: response.taskPrompt,
    response_text: response.responseText,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from("writing_responses")
    .upsert(rows, { onConflict: "submission_id,task_key" })
    .select("*");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const currentStatus = submission.submission_status || "in_progress";
  const shouldKeepSubmitted = payload.mode === "save" && (currentStatus === "submitted" || currentStatus === "reviewed");
  const submissionPatch =
    payload.mode === "submit"
      ? { submission_status: "submitted", submitted_at: new Date().toISOString() }
      : { submission_status: shouldKeepSubmitted ? currentStatus : "in_progress" };
  const { data: updatedSubmission } = await supabase
    .from("submissions")
    .update(submissionPatch)
    .eq("id", submission.id)
    .select("submission_status")
    .single();

  return Response.json({ submissionId: submission.id, submissionStatus: updatedSubmission?.submission_status || submissionPatch.submission_status, writingResponses: data || [] });
}

function canStudentSubmit(studentName: string, assignedStudents: string[]) {
  if (!assignedStudents.length) return true;
  const normalizedStudent = normalizeStudentName(studentName);
  return assignedStudents.some((student) => normalizeStudentName(student) === normalizedStudent);
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}
