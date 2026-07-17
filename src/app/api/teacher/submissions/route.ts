import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import type { Recording, Submission } from "@/lib/types";

export async function GET(request: NextRequest) {
  const unauthorized = requireTeacher(request);
  if (unauthorized) return unauthorized;

  const assignmentId = request.nextUrl.searchParams.get("assignmentId");
  const studentName = request.nextUrl.searchParams.get("studentName");
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("submissions")
    .select("*, assignments(title, deadline_text), recordings(*), feedback(*)")
    .order("submitted_at", { ascending: false });
  if (assignmentId) query = query.eq("assignment_id", assignmentId);
  if (studentName) query = query.ilike("student_name", studentName.trim());

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const submissions = await Promise.all(
    ((data || []) as Submission[]).map(async (submission) => {
      const recordings = await Promise.all(
        (submission.recordings || []).map(async (recording: Recording) => {
          const { data: signed } = await supabase.storage
            .from(recordingsBucket)
            .createSignedUrl(recording.storage_path, 60 * 60);
          return { ...recording, signed_url: signed?.signedUrl };
        })
      );
      return {
        ...submission,
        recordings,
        feedback: Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null
      };
    })
  );

  return Response.json({ submissions });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = requireTeacher(request);
  if (unauthorized) return unauthorized;

  const submissionId = request.nextUrl.searchParams.get("submissionId");
  if (!submissionId) {
    return Response.json({ error: "Missing submissionId." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: recordings, error: recordingsError } = await supabase
    .from("recordings")
    .select("storage_path")
    .eq("submission_id", submissionId);

  if (recordingsError) {
    return Response.json({ error: recordingsError.message }, { status: 500 });
  }

  const paths = (recordings || []).map((recording) => recording.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(recordingsBucket).remove(paths);
    if (storageError) {
      return Response.json({ error: storageError.message }, { status: 500 });
    }
  }

  const { error } = await supabase.from("submissions").delete().eq("id", submissionId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
