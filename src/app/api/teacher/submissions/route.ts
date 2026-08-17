import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { attachTeacherDemos } from "@/lib/teacherDemos";
import type { Recording, Submission } from "@/lib/types";

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;
  // Private buckets are reachable only with the service role. Every path signed
  // below came out of an RLS-filtered row, so the tenant boundary already held.
  const storage = getSupabaseAdmin();

  const assignmentId = request.nextUrl.searchParams.get("assignmentId");
  const studentName = request.nextUrl.searchParams.get("studentName");
  const assignmentType = request.nextUrl.searchParams.get("assignmentType");
  let query = supabase
    .from("submissions")
    .select("*, assignments(id, title, deadline_text, due_date, assignment_type, p1_questions, p2_prompt, p3_questions, writing_tasks), recordings(*), writing_responses(*), feedback(*)")
    .in("submission_status", ["submitted", "reviewed"])
    .order("submitted_at", { ascending: false });
  if (assignmentId) query = query.eq("assignment_id", assignmentId);
  if (studentName) query = query.ilike("student_name", studentName.trim());

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const filtered = ((data || []) as Submission[]).filter((submission) => {
    if (assignmentType !== "speaking" && assignmentType !== "writing") return true;
    const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
    return (assignment?.assignment_type || "speaking") === assignmentType;
  });

  const submissions = await Promise.all(
    filtered.map(async (submission) => {
      const recordings = await Promise.all(
        (submission.recordings || []).map(async (recording: Recording) => {
          const { data: signed } = await storage.storage
            .from(recordingsBucket)
            .createSignedUrl(recording.storage_path, 60 * 60);
          return { ...recording, signed_url: signed?.signedUrl };
        })
      );
      return {
        ...submission,
        recordings: await attachTeacherDemos(storage, recordings),
        feedback: Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null
      };
    })
  );

  return Response.json({ submissions });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;
  const storage = getSupabaseAdmin();

  const submissionId = request.nextUrl.searchParams.get("submissionId");
  if (!submissionId) {
    return Response.json({ error: "Missing submissionId." }, { status: 400 });
  }

  // RLS scopes this to the caller's workspace, so a miss means "not yours".
  const { data: submission } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return Response.json({ error: "Submission not found." }, { status: 404 });

  const { data: recordings, error: recordingsError } = await supabase
    .from("recordings")
    .select("id, storage_path")
    .eq("submission_id", submissionId);

  if (recordingsError) {
    return Response.json({ error: recordingsError.message }, { status: 500 });
  }

  const paths = (recordings || []).map((recording) => recording.storage_path).filter(Boolean);
  const recordingIds = (recordings || []).map((recording) => recording.id).filter(Boolean);
  if (recordingIds.length) {
    const { data: demos, error: demosError } = await supabase
      .from("teacher_demo_recordings")
      .select("storage_path")
      .in("recording_id", recordingIds);
    if (demosError) return Response.json({ error: demosError.message }, { status: 500 });
    paths.push(...(demos || []).map((demo) => demo.storage_path).filter(Boolean));
  }

  if (paths.length) {
    const { error: storageError } = await storage.storage.from(recordingsBucket).remove(paths);
    if (storageError) {
      return Response.json({ error: storageError.message }, { status: 500 });
    }
  }

  const { error } = await supabase.from("submissions").delete().eq("id", submissionId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
