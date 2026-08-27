import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { signRecordingUrls } from "@/lib/recordingUrls";
import type { SpeakingPracticeRecording, SpeakingPracticeSubmission } from "@/lib/types";

const feedbackSchema = z.object({
  practiceId: z.string().uuid(),
  teacherComment: z.string().optional(),
  fluencyScore: z.number().nullable().optional(),
  grammarScore: z.number().nullable().optional(),
  vocabularyScore: z.number().nullable().optional(),
  recordingComments: z.record(z.string(), z.string()).optional()
});

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const studentName = request.nextUrl.searchParams.get("studentName")?.trim() || "";
  let query = supabase
    .from("speaking_practice_submissions")
    .select("*, recordings:speaking_practice_recordings(*)")
    .eq("teacher_id", account.id)
    .in("status", ["submitted", "reviewed"])
    .order("submitted_at", { ascending: false });
  if (studentName) query = query.ilike("student_name", studentName);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ practices: await attachSignedUrls((data || []) as SpeakingPracticeSubmission[]) });
}

export async function PATCH(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const payload = feedbackSchema.parse(await request.json());
  const { data: practice, error: practiceError } = await supabase
    .from("speaking_practice_submissions")
    .select("id")
    .eq("id", payload.practiceId)
    .eq("teacher_id", account.id)
    .maybeSingle();

  if (practiceError) return Response.json({ error: practiceError.message }, { status: 500 });
  if (!practice) return Response.json({ error: "没有找到这个自主练习。" }, { status: 404 });

  const { error: updateError } = await supabase
    .from("speaking_practice_submissions")
    .update({
      status: "reviewed",
      teacher_comment: payload.teacherComment || "",
      fluency_score: payload.fluencyScore,
      grammar_score: payload.grammarScore,
      vocabulary_score: payload.vocabularyScore,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", payload.practiceId)
    .eq("teacher_id", account.id);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const comments = payload.recordingComments || {};
  await Promise.all(
    Object.entries(comments).map(([recordingId, comment]) =>
      supabase
        .from("speaking_practice_recordings")
        .update({ teacher_comment: comment })
        .eq("id", recordingId)
        .eq("practice_submission_id", payload.practiceId)
    )
  );

  const { data: updated, error } = await supabase
    .from("speaking_practice_submissions")
    .select("*, recordings:speaking_practice_recordings(*)")
    .eq("id", payload.practiceId)
    .single<SpeakingPracticeSubmission>();

  if (error || !updated) return Response.json({ error: error?.message || "保存后无法加载练习。" }, { status: 500 });
  return Response.json({ practice: (await attachSignedUrls([updated]))[0] });
}

async function attachSignedUrls(practices: SpeakingPracticeSubmission[]) {
  const supabase = getSupabaseAdmin();
  // One batch across every practice, rather than a request per recording.
  const signedUrls = await signRecordingUrls(
    supabase,
    recordingsBucket,
    practices.flatMap((practice) =>
      (practice.recordings || []).map((recording: SpeakingPracticeRecording) => recording.storage_path)
    )
  );

  return practices.map((practice) => ({
    ...practice,
    recordings: (practice.recordings || []).map((recording: SpeakingPracticeRecording) => ({
      ...recording,
      signed_url: signedUrls.get(recording.storage_path)
    }))
  }));
}
