import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { readTimer, startTimer } from "@/lib/writingTimer";

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

  // The student's own latest attempt at this homework; RLS keeps it theirs.
  let submissionId = parsed.data.submissionId || "";
  let startedAt: string | null = null;
  const { data: existing } = await supabase
    .from("submissions")
    .select("id, timer_started_at, submission_status")
    .eq("assignment_id", assignmentId)
    .ilike("student_name", account.display_name)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    submissionId = existing.id;
    startedAt = existing.timer_started_at;
  }

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
      startedAt = await startTimer(supabase, submissionId);
    } catch (problem) {
      return Response.json({ error: problem instanceof Error ? problem.message : "Could not start the timer." }, { status: 500 });
    }
  }

  return Response.json({ submissionId: submissionId || null, timer: readTimer(minutes, startedAt) });
}
