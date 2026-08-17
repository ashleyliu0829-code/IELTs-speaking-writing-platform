import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
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

  const submissions = await Promise.all(
    ((data || []) as Submission[]).map(async (submission) => {
      const recordings = await Promise.all(
        (submission.recordings || []).map(async (recording: Recording) => {
          const { data: signed } = await storage.storage
            .from(recordingsBucket)
            .createSignedUrl(recording.storage_path, 60 * 60);
          return { ...recording, signed_url: signed?.signedUrl };
        })
      );
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
