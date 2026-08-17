import { NextRequest } from "next/server";
import { z } from "zod";
import { feedbackModel, getAiClient, type AiClient } from "@/lib/ai";
import { requireTeacher } from "@/lib/auth";
import { defaultScoreDetails, scoreDetails } from "@/lib/feedback";
import { averageScore } from "@/lib/questions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkQuota, estimateAiCostMicros, recordUsage } from "@/lib/usage";
import type { FeedbackDetail, Recording, WritingResponse } from "@/lib/types";

const payloadSchema = z.object({
  submissionId: z.string().uuid()
});

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const openai = getAiClient();
  if (!openai) {
    return Response.json({ error: "AI 服务未配置：缺少 AI_API_KEY。" }, { status: 500 });
  }

  const { submissionId } = payloadSchema.parse(await request.json());

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
  if (isWriting) {
    return analyzeWritingSubmission(supabase, openai, submissionId, submission.writing_responses || [], teacher.id);
  }

  const { data: recordings, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("submission_id", submissionId)
    .order("question_key");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!recordings?.length) return Response.json({ error: "No recordings found." }, { status: 404 });

  const recordingBlocks = (recordings as Recording[]).map((recording) => ({
    part: recording.question_key,
    label: recording.question_label,
    question: recording.question_text,
    duration_seconds: recording.duration_seconds
  }));

  const scoring = await openai.chat.completions.create({
    model: feedbackModel(),
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an IELTS Speaking teacher. You only have question text and recording duration. Give conservative draft scores for Fluency, Grammar, and Vocabulary from 0 to 9 in 0.5 increments. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Return {overall_comment:string, details:[{part,label,question,score,comment}]}. The details array must contain exactly three items with part values: fluency, grammar, vocabulary. Use labels: Fluency, Grammar, Vocabulary. Keep comments brief and mark them as draft because the teacher should listen before publishing final feedback.",
          recordings: recordingBlocks
        })
      }
    ],
    response_format: { type: "json_object" }
  });

  await recordUsage({
    teacherId: teacher.id,
    accountId: teacher.id,
    eventType: "ai_feedback",
    quantity: scoring.usage?.total_tokens || 0,
    unit: "tokens",
    costMicros: estimateAiCostMicros(scoring.usage?.total_tokens || 0),
    metadata: { submissionId, model: scoring.model }
  });

  const parsed = parseFeedback(scoring.choices[0]?.message?.content || "{}");
  const details = [
    ...normalizeDetails(parsed.details || []),
    ...recordingBlocks.map((block) => ({
      part: `comment:${block.part}`,
      label: block.label,
      question: block.question,
      score: 0,
      comment: ""
    }))
  ];
  const overall_score = averageScore(scoreDetails(details));

  const feedback = {
    submission_id: submissionId,
    overall_score,
    overall_comment:
      parsed.overall_comment ||
      "Draft feedback created from assignment metadata. Please listen to the recordings before publishing final comments.",
    details,
    transcript: "",
    published_at: null
  };

  const { data, error: upsertError } = await supabase
    .from("feedback")
    .upsert(feedback, { onConflict: "submission_id" })
    .select("*")
    .single();

  if (upsertError) return Response.json({ error: upsertError.message }, { status: 500 });
  return Response.json({ feedback: data });
}

async function analyzeWritingSubmission(
  supabase: SupabaseClient,
  openai: AiClient,
  submissionId: string,
  responses: WritingResponse[],
  teacherId: string | null
) {
  if (!responses.length) return Response.json({ error: "No writing responses found." }, { status: 404 });

  const responseBlocks = responses.map((response) => ({
    part: response.task_key,
    label: response.task_label,
    question: response.task_title,
    prompt: response.task_prompt,
    answer: response.response_text
  }));

  const scoring = await openai.chat.completions.create({
    model: feedbackModel(),
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an IELTS Writing teacher. Give conservative draft scores for Task Response, Coherence, Grammar, and Vocabulary from 0 to 9 in 0.5 increments. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Return {overall_comment:string, details:[{part,label,question,score,comment}]}. The details array must contain exactly four score items with part values: task_response, coherence, grammar, vocabulary. Keep comments brief and mark them as draft because the teacher should review before publishing final feedback.",
          responses: responseBlocks
        })
      }
    ],
    response_format: { type: "json_object" }
  });

  await recordUsage({
    teacherId,
    accountId: teacherId,
    eventType: "ai_writing_review",
    quantity: scoring.usage?.total_tokens || 0,
    unit: "tokens",
    costMicros: estimateAiCostMicros(scoring.usage?.total_tokens || 0),
    metadata: { submissionId, model: scoring.model }
  });

  const parsed = parseFeedback(scoring.choices[0]?.message?.content || "{}");
  const details = [
    ...normalizeWritingDetails(parsed.details || []),
    ...responses.map((response) => ({
      part: `comment:${response.task_key}`,
      label: response.task_label,
      question: response.task_title,
      score: 0,
      comment: ""
    }))
  ];
  const overall_score = averageScore(scoreDetails(details));

  const feedback = {
    submission_id: submissionId,
    overall_score,
    overall_comment: parsed.overall_comment || "Draft writing feedback created by AI. Please review before publishing.",
    details,
    transcript: "",
    published_at: null
  };

  const { data, error } = await supabase
    .from("feedback")
    .upsert(feedback, { onConflict: "submission_id" })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ feedback: data });
}

function parseFeedback(content: string) {
  try {
    return JSON.parse(content) as { overall_comment?: string; details?: FeedbackDetail[] };
  } catch {
    return {};
  }
}

function normalizeDetails(details: FeedbackDetail[]) {
  return defaultScoreDetails().map((criterion) => {
    const detail =
      details.find((item) => item.part?.toLowerCase() === criterion.part) ||
      details.find((item) => item.label?.toLowerCase() === criterion.label.toLowerCase());
    return {
      part: criterion.part,
      label: criterion.label,
      question: criterion.question,
      score: clampScore(Number(detail?.score || 0)),
      comment: ""
    };
  });
}

function normalizeWritingDetails(details: FeedbackDetail[]) {
  const criteria: FeedbackDetail[] = [
    {
      part: "task_response",
      label: "Task Response",
      question: "Overall task response score",
      score: 0,
      comment: ""
    },
    {
      part: "coherence",
      label: "Coherence",
      question: "Overall coherence score",
      score: 0,
      comment: ""
    },
    {
      part: "grammar",
      label: "Grammar",
      question: "Overall grammar score",
      score: 0,
      comment: ""
    },
    {
      part: "vocabulary",
      label: "Vocabulary",
      question: "Overall vocabulary score",
      score: 0,
      comment: ""
    }
  ];

  return criteria.map((criterion) => {
    const detail =
      details.find((item) => item.part?.toLowerCase() === criterion.part) ||
      details.find((item) => item.label?.toLowerCase() === criterion.label.toLowerCase());
    return {
      ...criterion,
      score: clampScore(Number(detail?.score || 0)),
      comment: ""
    };
  });
}

function clampScore(score: number) {
  const rounded = Math.round(score * 2) / 2;
  return Math.max(0, Math.min(9, rounded));
}
