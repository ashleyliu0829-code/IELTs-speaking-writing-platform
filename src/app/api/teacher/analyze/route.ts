import { NextRequest } from "next/server";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { defaultScoreDetails, scoreDetails } from "@/lib/feedback";
import { averageScore } from "@/lib/questions";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import type { FeedbackDetail, Recording } from "@/lib/types";

const payloadSchema = z.object({
  submissionId: z.string().uuid()
});

type TranscriptBlock = {
  part: string;
  label: string;
  question: string;
  transcript: string;
};

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

  const transcriptBlocks: TranscriptBlock[] = [];
  for (const recording of recordings as Recording[]) {
    let transcriptText = recording.transcript_text || "";

    if (!transcriptText) {
      const { data: audio, error: downloadError } = await supabase.storage
        .from(recordingsBucket)
        .download(recording.storage_path);

      if (downloadError || !audio) {
        return Response.json({ error: downloadError?.message || "Audio download failed." }, { status: 500 });
      }

      const buffer = Buffer.from(await audio.arrayBuffer());
      const file = await toFile(buffer, `${recording.question_key}.webm`, { type: "audio/webm" });
      const transcript = await openai.audio.transcriptions.create({
        file,
        model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1"
      });
      transcriptText = transcript.text || "";

      if (transcriptText) {
        await supabase.from("recordings").update({ transcript_text: transcriptText }).eq("id", recording.id);
      }
    }

    transcriptBlocks.push({
      part: recording.question_key,
      label: recording.question_label,
      question: recording.question_text,
      transcript: transcriptText
    });
  }

  const scoring = await openai.chat.completions.create({
    model: process.env.OPENAI_FEEDBACK_MODEL || "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an IELTS Speaking teacher. Give practical homework feedback. Score Fluency, Grammar, and Vocabulary from 0 to 9 in 0.5 increments. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Evaluate the IELTS speaking homework. Return {overall_comment:string, details:[{part,label,question,score,comment}]}. The details array must contain exactly three items with part values: fluency, grammar, vocabulary. Use labels: Fluency, Grammar, Vocabulary. The question field should name the rubric area. Each comment should include evidence from the transcript and one concrete next step.",
          answers: transcriptBlocks
        })
      }
    ],
    response_format: { type: "json_object" }
  });

  const parsed = parseFeedback(scoring.choices[0]?.message?.content || "{}");
  const details = [
    ...normalizeDetails(parsed.details || []),
    ...transcriptBlocks.map((block) => ({
      part: `comment:${block.part}`,
      label: block.label,
      question: block.question,
      score: 0,
      comment: ""
    }))
  ];
  const overall_score = averageScore(scoreDetails(details));
  const transcriptText = transcriptBlocks.map((block) => `${block.label}\n${block.transcript}`).join("\n\n");

  const feedback = {
    submission_id: submissionId,
    overall_score,
    overall_comment:
      parsed.overall_comment ||
      "The student completed the homework. Review answer development, vocabulary precision, grammar control, and fluency before publishing final feedback.",
    details,
    transcript: transcriptText,
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
      comment: detail?.comment || "This area needs teacher review before final feedback is published."
    };
  });
}

function clampScore(score: number) {
  const rounded = Math.round(score * 2) / 2;
  return Math.max(0, Math.min(9, rounded));
}
