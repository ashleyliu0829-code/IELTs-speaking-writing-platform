import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import type { Recording, Submission } from "@/lib/types";

export async function GET(request: NextRequest) {
  const unauthorized = requireTeacher(request);
  if (unauthorized) return unauthorized;

  const assignmentId = request.nextUrl.searchParams.get("assignmentId");
  const supabase = getSupabaseAdmin();
  let query = supabase.from("submissions").select("*, recordings(*), feedback(*)").order("submitted_at", { ascending: false });
  if (assignmentId) query = query.eq("assignment_id", assignmentId);

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
