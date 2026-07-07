import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { defaultScoreDetails, scoreDetails } from "@/lib/feedback";
import { averageScore } from "@/lib/questions";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FeedbackDetail, Recording } from "@/lib/types";

const payloadSchema = z.object({
  submissionId: z.string().uuid()
});

export async function POST(request: NextRequest) {
  const unauthorized = requireTeacher(request);
  if (unauthorized) return unauthorized;

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  const { submissionId } = payloadSchema.parse(await request.json());
  const supabase = getSupabaseAdmin();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    model: process.env.OPENAI_FEEDBACK_MODEL || "gpt-4.1-mini",
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

function clampScore(score: number) {
  const rounded = Math.round(score * 2) / 2;
  return Math.max(0, Math.min(9, rounded));
}
