import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth";
import type { StudentProfile, Submission } from "@/lib/types";

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const assignmentType = request.nextUrl.searchParams.get("assignmentType");
  const [{ data: students, error: studentsError }, { data: submissions, error: submissionsError }] = await Promise.all([
    supabase.from("students").select("*").order("last_seen_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("id, student_name, submitted_at, submission_status, assignments(assignment_type), feedback(overall_score, published_at)")
      .in("submission_status", ["submitted", "reviewed"])
  ]);

  if (studentsError) return Response.json({ error: studentsError.message }, { status: 500 });
  if (submissionsError) return Response.json({ error: submissionsError.message }, { status: 500 });

  const stats = new Map<string, Partial<StudentProfile>>();
  ((submissions || []) as Submission[]).forEach((submission) => {
    const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
    if ((assignmentType === "speaking" || assignmentType === "writing") && (assignment?.assignment_type || "speaking") !== assignmentType) {
      return;
    }
    const key = normalizeStudentName(submission.student_name);
    const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null;
    const current = stats.get(key) || {
      submission_count: 0,
      reviewed_count: 0,
      latest_submission_at: null,
      latest_score: null
    };

    current.submission_count = (current.submission_count || 0) + 1;
    if (feedback?.published_at) current.reviewed_count = (current.reviewed_count || 0) + 1;
    if (!current.latest_submission_at || submission.submitted_at > current.latest_submission_at) {
      current.latest_submission_at = submission.submitted_at;
      current.latest_score = feedback?.published_at ? Number(feedback.overall_score || 0) : null;
    }
    stats.set(key, current);
  });

  const profiles = ((students || []) as StudentProfile[]).map((student) => ({
    ...student,
    submission_count: stats.get(student.normalized_name)?.submission_count || 0,
    reviewed_count: stats.get(student.normalized_name)?.reviewed_count || 0,
    latest_submission_at: stats.get(student.normalized_name)?.latest_submission_at || null,
    latest_score: stats.get(student.normalized_name)?.latest_score ?? null
  }));

  return Response.json({ students: profiles });
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}
