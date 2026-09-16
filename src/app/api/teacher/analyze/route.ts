import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { defaultScoreDetails, defaultWritingScoreDetails, scoreDetails } from "@/lib/feedback";
import { averageScore } from "@/lib/questions";
import { ClaudeError, askClaudeJson } from "@/lib/claude";
import { checkQuota, estimateClaudeCostMicros, recordUsage } from "@/lib/usage";
import type { FeedbackDetail, Recording, WritingResponse } from "@/lib/types";

/**
 * A draft of the teacher's feedback, scores filled in by Claude: the four
 * writing criteria from the essay text, or the four speaking criteria from
 * the transcripts. The draft lands in the teacher's own feedback editor
 * (unpublished) for them to adjust; for speaking, the fuller second opinion
 * is the AI assessment panel, which this route does not replace.
 *
 * Only for teachers the operator has switched on (accounts.ai_enabled).
 */

const payloadSchema = z.object({ submissionId: z.string().uuid() });

const draftSchema = z.object({
  overall_comment: z.string().default(""),
  details: z.array(z.object({ part: z.string(), score: z.coerce.number() })).default([])
});

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

  // RLS scopes this to the caller's workspace, so a miss means "not yours".
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("*, assignments(assignment_type), recordings(*), writing_responses(*)")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError || !submission) {
    return Response.json({ error: submissionError?.message || "Submission not found." }, { status: 404 });
  }

  const isWriting = submission.assignments?.assignment_type === "writing" || Boolean(submission.writing_responses?.length);
  const responses = (submission.writing_responses || []) as WritingResponse[];
  const recordings = (submission.recordings || []) as Recording[];

  let system: string;
  let user: string;
  let criteria: FeedbackDetail[];
  let commentDetails: FeedbackDetail[];
  let eventType: "ai_feedback" | "ai_writing_review";

  if (isWriting) {
    if (!responses.length) return Response.json({ error: "No writing responses found." }, { status: 404 });
    criteria = defaultWritingScoreDetails();
    commentDetails = responses.map((response) => ({ part: `comment:${response.task_key}`, label: response.task_label, question: response.task_title, score: 0, comment: "" }));
    eventType = "ai_writing_review";
    system = [
      "You are an IELTS Writing examiner assisting a Chinese teacher. Score the essay(s) on the public band descriptors — Task Response, Coherence & Cohesion, Grammatical Range & Accuracy, Lexical Resource — from 4.0 to 8.5 in 0.5 steps. Be calibrated: frequent basic errors and simple vocabulary is band 5.0–5.5; band 6.0 needs mostly accurate simple structures with some complex attempts.",
      "Write the overall comment in Chinese for the teacher, 3–4 sentences, naming the actual errors and the strongest point, quoting the student's English verbatim.",
      'Reply with a single JSON object and nothing else: {"overall_comment": "string", "details": [{"part": "task_response", "score": 6}, {"part": "coherence", "score": 6}, {"part": "grammar", "score": 5.5}, {"part": "vocabulary", "score": 6}]}'
    ].join("\n");
    user = JSON.stringify(responses.map((response) => ({ part: response.task_key, task: response.task_title, prompt: response.task_prompt, essay: response.response_text })));
  } else {
    const answers = recordings
      .map((recording) => ({ part: recording.question_key, question: recording.question_text, transcript: (recording.corrected_transcript_text || recording.transcript_text || "").trim() }))
      .filter((item) => item.transcript);
    if (!answers.length) return Response.json({ error: "还没有转写。请先为录音生成转写。" }, { status: 400 });
    criteria = defaultScoreDetails();
    commentDetails = recordings.map((recording) => ({ part: `comment:${recording.question_key}`, label: recording.question_label, question: recording.question_text, score: 0, comment: "" }));
    eventType = "ai_feedback";
    system = [
      "You are an IELTS Speaking examiner assisting a Chinese teacher. From the transcripts, score Fluency & Coherence, Lexical Resource and Grammatical Range & Accuracy from 4.0 to 8.5 in 0.5 steps; give Pronunciation 0, since it cannot be judged from text.",
      "Write the overall comment in Chinese for the teacher, 3–4 sentences, naming the actual errors and the strongest point, quoting the student's English verbatim.",
      'Reply with a single JSON object and nothing else: {"overall_comment": "string", "details": [{"part": "fluency", "score": 6.5}, {"part": "vocabulary", "score": 6}, {"part": "grammar", "score": 5.5}, {"part": "pronunciation", "score": 0}]}'
    ].join("\n");
    user = JSON.stringify(answers);
  }

  let reply: Awaited<ReturnType<typeof askClaudeJson>>;
  try {
    reply = await askClaudeJson(system, user);
  } catch (error) {
    const status = error instanceof ClaudeError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "AI 分析失败。" }, { status });
  }

  await recordUsage({
    teacherId: teacher.id,
    accountId: teacher.id,
    eventType,
    quantity: reply.inputTokens + reply.outputTokens,
    unit: "tokens",
    costMicros: estimateClaudeCostMicros(reply.inputTokens, reply.outputTokens),
    metadata: { submissionId, model: reply.model, kind: "draft" }
  });

  const draft = draftSchema.safeParse(reply.json);
  if (!draft.success) return Response.json({ error: "AI 返回的内容无法解析，请重试。" }, { status: 502 });

  const scored = criteria.map((criterion) => {
    const found = draft.data.details.find((item) => item.part.toLowerCase() === criterion.part);
    return { ...criterion, score: clampScore(found?.score ?? 0) };
  });
  const details = [...scored, ...commentDetails];

  const feedback = {
    submission_id: submissionId,
    overall_score: averageScore(scoreDetails(details)),
    overall_comment: draft.data.overall_comment || "AI 草稿：请核对分数后再发布。",
    details,
    transcript: "",
    published_at: null
  };

  const { data, error } = await supabase.from("feedback").upsert(feedback, { onConflict: "submission_id" }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ feedback: data });
}

function clampScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.max(0, Math.min(9, Math.round(score * 2) / 2));
}
