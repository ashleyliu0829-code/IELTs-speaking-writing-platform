import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { readStudentTimer, readTimer, startTimer } from "@/lib/writingTimer";

/**
 * Starts the exam clock on a timed writing homework, and reports where it is.
 *
 * The student presses start once; from then on the remaining time is worked
 * out from the moment stored here, so reloading the page or opening it again
 * somewhere else carries on rather than starting over. A submission is created
 * if there is not one yet — the clock has to belong to something.
 */

const payloadSchema = z.object({
  assignmentId: z.string().uuid(),
  submissionId: z.string().uuid().optional(),
  start: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { assignmentId, start } = parsed.data;

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, timed_minutes, assigned_students")
    .eq("id", assignmentId)
    .eq("is_active", true)
    .maybeSingle();
  if (!assignment) return Response.json({ error: "Assignment not found." }, { status: 404 });

  const minutes = Number(assignment.timed_minutes || 0);
  if (!minutes) return Response.json({ timer: readTimer(0, null) });

  // The clock is the earliest start across every row this student has for
  // the homework, so an extra submission cannot hand back time.
  let current;
  try {
    current = await readStudentTimer(supabase, assignmentId, account.display_name);
  } catch (problem) {
    return Response.json({ error: problem instanceof Error ? problem.message : "Could not read the timer." }, { status: 500 });
  }
  let submissionId = current.submissionId;
  let startedAt = current.startedAt;

  if (start && !startedAt) {
    if (!submissionId) {
      const { data: created, error } = await supabase
        .from("submissions")
        .insert({
          assignment_id: assignmentId,
          student_name: account.display_name,
          submission_title: "",
          teacher_id: account.teacher_id,
          submission_status: "in_progress"
        })
        .select("id")
        .single();
      if (error || !created) return Response.json({ error: error?.message || "Could not start." }, { status: 500 });
      submissionId = created.id;
    }
    try {
      startedAt = await startTimer(supabase, assignmentId, account.display_name, submissionId);
    } catch (problem) {
      return Response.json({ error: problem instanceof Error ? problem.message : "Could not start the timer." }, { status: 500 });
    }
  }

  return Response.json({ submissionId: submissionId || null, timer: readTimer(minutes, startedAt) });
}
