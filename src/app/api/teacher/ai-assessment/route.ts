import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { checkQuota } from "@/lib/usage";
import { AssessmentError, assessSpeakingSubmission, assessmentColumns } from "@/lib/aiAssessment";
import type { Recording } from "@/lib/types";

/**
 * AI preliminary assessment of a speaking submission — the teacher's private
 * second opinion, never shown to the student.
 *
 * It reads the transcripts (the teacher's corrected version where one
 * exists) and scores the three criteria a transcript can support: Fluency &
 * Coherence, Lexical Resource, Grammatical Range & Accuracy. Pronunciation
 * cannot be judged from text, so that criterion is returned without a score
 * and a note saying the teacher decides it by ear — a made-up number there
 * would be worse than none.
 *
 * Runs only for teachers the operator has switched on (accounts.ai_enabled)
 * and counts against the AI quota like the older draft-feedback call.
 */

const payloadSchema = z.object({ submissionId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;
  if (!teacher.ai_enabled) return Response.json({ assessment: null, enabled: false });

  const submissionId = request.nextUrl.searchParams.get("submissionId") || "";
  if (!z.string().uuid().safeParse(submissionId).success) return Response.json({ error: "Missing submissionId." }, { status: 400 });

  const { data, error } = await supabase.from("ai_assessments").select(assessmentColumns).eq("submission_id", submissionId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ assessment: data, enabled: true });
}

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  if (!teacher.ai_enabled) return Response.json({ error: "这个账号还没有开通 AI 功能。" }, { status: 403 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { submissionId } = parsed.data;

  const quotaError = await checkQuota(teacher.id, "ai_feedback");
  if (quotaError) return Response.json({ error: quotaError }, { status: 429 });

  // RLS scopes the submission to the caller's workspace.
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("id, student_name, assignments(assignment_type), recordings(*)")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError) return Response.json({ error: submissionError.message }, { status: 500 });
  if (!submission) return Response.json({ error: "Submission not found." }, { status: 404 });
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  if ((assignment?.assignment_type || "speaking") !== "speaking") {
    return Response.json({ error: "AI 初评目前只支持口语作业。" }, { status: 400 });
  }

  try {
    const assessment = await assessSpeakingSubmission(supabase, teacher.id, submissionId, submission.student_name, (submission.recordings || []) as Recording[]);
    return Response.json({ assessment, enabled: true });
  } catch (error) {
    const status = error instanceof AssessmentError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "AI 初评失败。" }, { status });
  }
}
