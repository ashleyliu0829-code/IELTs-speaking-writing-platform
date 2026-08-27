import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { signRecordingUrls } from "@/lib/recordingUrls";
import { attachTeacherDemos } from "@/lib/teacherDemos";
import type { Feedback, Recording, Submission } from "@/lib/types";

const payloadSchema = z.object({
  studentName: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;
  // Private buckets need the service role; every path signed below came out of
  // an RLS-filtered row.
  const storage = getSupabaseAdmin();

  const payload = payloadSchema.parse(await request.json());
  const studentName = payload.studentName.trim();

  const { data, error } = await supabase
    .from("submissions")
    .select("*, assignments(id, title, deadline_text, due_date, assignment_type, p1_questions, p2_prompt, p3_questions, writing_tasks), recordings(*), writing_responses(*), feedback(*)")
    .ilike("student_name", studentName)
    .order("submitted_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as Submission[];
  const signedUrls = await signRecordingUrls(
    storage,
    recordingsBucket,
    rows.flatMap((submission) => (submission.recordings || []).map((recording: Recording) => recording.storage_path))
  );

  const submissions = await Promise.all(
    rows.map(async (submission) => {
      const recordings = (submission.recordings || []).map((recording: Recording) => ({
        ...recording,
        signed_url: signedUrls.get(recording.storage_path)
      }));
      const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null;
      const publishedFeedback = feedback?.published_at ? (feedback as Feedback) : null;

      return {
        ...submission,
        recordings: await attachTeacherDemos(storage, recordings),
        feedback: publishedFeedback
      };
    })
  );

  return Response.json({ submissions });
}
