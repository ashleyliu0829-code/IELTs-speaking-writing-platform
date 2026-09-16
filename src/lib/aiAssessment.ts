import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { claudeModel, extractJson } from "@/lib/claude";
import { estimateClaudeCostMicros, recordUsage } from "@/lib/usage";
import type { AiAssessment, Recording } from "@/lib/types";

/**
 * The AI preliminary assessment of a speaking submission, as one function so
 * the route and an operator script share the prompt and the parsing.
 *
 * Runs on Claude. The transcripts (the teacher's corrected version where one
 * exists) are scored on the three IELTS Speaking criteria a transcript can
 * support — Fluency & Coherence, Lexical Resource, Grammatical Range &
 * Accuracy. Pronunciation cannot be judged from text, so it comes back with
 * no score and a note for the teacher; a made-up number there would be worse
 * than none. The reply is JSON, validated against the schema below so a
 * malformed answer fails loudly instead of storing junk. (The SDK's
 * structured-output mode returned placeholder text for this prompt; plain
 * JSON with validation is what works.)
 */

export class AssessmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const assessmentColumns = "id, submission_id, model, band_estimate, criteria, summary, strengths, priorities, per_question, created_at";

const scoredCriterion = z.object({
  score: z.coerce.number().describe("4.0 to 8.5 in 0.5 steps"),
  comment: z.string().describe("Chinese, 2-3 sentences, specific to this student"),
  evidence: z.array(z.string()).default([]).describe("Up to 3 verbatim English quotes from the transcripts")
});

const assessmentSchema = z.object({
  band_estimate: z.coerce.number().describe("Overall speaking band the transcripts suggest, 0.5 steps"),
  criteria: z.object({
    fluency_coherence: scoredCriterion,
    lexical_resource: scoredCriterion,
    grammar: scoredCriterion.describe("Quote each error with the correction in brackets"),
    pronunciation: z.object({
      comment: z
        .string()
        .describe("Chinese: say the teacher decides this by listening, and list any words that ASR likely misheard, which hints at pronunciation issues"),
      evidence: z.array(z.string()).default([]).describe("Words in the transcript that look misheard, if any")
    })
  }),
  summary: z.string().default("").describe("Chinese, 2 sentences: the level, and the single biggest thing holding the score down"),
  strengths: z.array(z.string()).default([]).describe("2-3 items, Chinese, each with a quote"),
  priorities: z.array(z.string()).default([]).describe("2-3 items, Chinese: what to fix first, concrete")
});

const systemPrompt = [
  "You are an experienced IELTS Speaking examiner assisting a Chinese IELTS teacher. You receive the questions and the transcripts of one student's answers (Part 1 / Part 2 / Part 3).",
  "Assess against the public IELTS Speaking band descriptors. Be calibrated: a typical Chinese learner with frequent basic errors and simple vocabulary is band 5.0–5.5; band 6.0 needs mostly accurate simple structures with some complex attempts; band 7.0 needs flexible, mostly error-free complex language with some less common vocabulary.",
  "Score Fluency & Coherence, Lexical Resource and Grammatical Range & Accuracy from 4.0 to 8.5 in 0.5 steps. Do not score Pronunciation: it cannot be judged from text.",
  "Write every comment in Chinese for the teacher, and quote the student's English verbatim as evidence. Be specific: name the actual error, the actual good phrase, the actual discourse marker — never generic advice. Keep each criterion comment to 2–3 sentences. Inside JSON strings wrap quoted English in “ ” (curly quotes), never in straight double quotes.",
  "Reply with a single JSON object and nothing else — no markdown fences, no prose. Every key below is required, in this order:",
  JSON.stringify({
    band_estimate: 6.5,
    summary: "string, 2 sentences: the level and the single biggest thing holding the score down",
    strengths: ["2-3 strings, each with a quote"],
    priorities: ["2-3 strings: what to fix first, concrete"],
    criteria: {
      fluency_coherence: { score: 6.5, comment: "string, 2-3 sentences", evidence: ["up to 3 verbatim quotes"] },
      lexical_resource: { score: 6, comment: "string, 2-3 sentences", evidence: ["up to 3 verbatim quotes"] },
      grammar: { score: 5.5, comment: "string, 2-3 sentences", evidence: ["up to 4 errors, each with the correction in brackets"] },
      pronunciation: { comment: "string: the teacher decides this by listening; list any words ASR likely misheard", evidence: ["string"] }
    }
  })
].join("\n");

export async function assessSpeakingSubmission(
  supabase: SupabaseClient,
  teacherId: string,
  submissionId: string,
  studentName: string,
  recordingRows: Recording[]
) {
  if (!process.env.ANTHROPIC_API_KEY) throw new AssessmentError("Missing ANTHROPIC_API_KEY.", 500);

  const recordings = [...recordingRows].sort((a, b) => a.question_key.localeCompare(b.question_key));
  const answers = recordings
    .map((recording) => ({
      part: recording.question_key,
      label: recording.question_label,
      question: recording.question_text,
      seconds: recording.duration_seconds,
      transcript: (recording.corrected_transcript_text || recording.transcript_text || "").trim()
    }))
    .filter((item) => item.transcript);
  if (!answers.length) throw new AssessmentError("还没有转写。请先为录音生成转写，AI 初评基于转写文字。", 400);

  const client = new Anthropic();
  const user = JSON.stringify({ student: studentName, answers });

  // A malformed reply is rare but not free to show the teacher; one silent
  // retry covers nearly all of them.
  let parsed: z.infer<typeof assessmentSchema> | null = null;
  let model = claudeModel;
  for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: claudeModel,
        max_tokens: 16000,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }]
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AssessmentError("AI 服务的密钥无效，请联系平台管理员。", 503);
      if (error instanceof Anthropic.RateLimitError) throw new AssessmentError("AI 服务当前繁忙或额度已用完，请稍后再试或联系平台管理员。", 503);
      if (error instanceof Anthropic.APIError) throw new AssessmentError(`AI 服务出错（${error.status}）：${error.message}`, 502);
      throw error;
    }
    model = response.model;

    const totalTokens = (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0);
    await recordUsage({
      teacherId,
      accountId: teacherId,
      eventType: "ai_feedback",
      quantity: totalTokens,
      unit: "tokens",
      costMicros: estimateClaudeCostMicros(response.usage.input_tokens || 0, response.usage.output_tokens || 0),
      metadata: { submissionId, model: response.model, kind: "assessment", attempt }
    });

    if (response.stop_reason === "refusal") throw new AssessmentError("AI 拒绝了这次评估，请稍后再试。", 502);
    if (response.stop_reason === "max_tokens") throw new AssessmentError("AI 回复过长被截断，请重试。", 502);
    const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    const parsedResult = assessmentSchema.safeParse(extractJson(text));
    if (parsedResult.success) {
      parsed = parsedResult.data;
    } else {
      console.error(`ai-assessment: unparseable reply (attempt ${attempt + 1})`, parsedResult.error.issues.slice(0, 5), text.slice(0, 600));
    }
  }
  if (!parsed) throw new AssessmentError("AI 返回的内容无法解析，请重试。", 502);

  const criteria: AiAssessment["criteria"] = {
    fluency_coherence: { score: clampScore(parsed.criteria.fluency_coherence.score), comment: parsed.criteria.fluency_coherence.comment, evidence: parsed.criteria.fluency_coherence.evidence.slice(0, 4) },
    lexical_resource: { score: clampScore(parsed.criteria.lexical_resource.score), comment: parsed.criteria.lexical_resource.comment, evidence: parsed.criteria.lexical_resource.evidence.slice(0, 4) },
    grammar: { score: clampScore(parsed.criteria.grammar.score), comment: parsed.criteria.grammar.comment, evidence: parsed.criteria.grammar.evidence.slice(0, 4) },
    pronunciation: { score: null, comment: parsed.criteria.pronunciation.comment, evidence: splitList(parsed.criteria.pronunciation.evidence).slice(0, 8) }
  };

  const row = {
    submission_id: submissionId,
    teacher_id: teacherId,
    model,
    band_estimate: clampScore(parsed.band_estimate),
    criteria,
    summary: parsed.summary,
    strengths: parsed.strengths.slice(0, 4),
    priorities: parsed.priorities.slice(0, 4),
    per_question: [],
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("ai_assessments").upsert(row, { onConflict: "submission_id" }).select(assessmentColumns).single();
  if (error) throw new AssessmentError(error.message, 500);
  return data as AiAssessment;
}

// The misheard-word list sometimes arrives as one string joined with 、 or ;
// — one word per item is what the card needs.
function splitList(items: string[]) {
  return items
    .flatMap((item) => item.split(/\s*[、;；]\s*/))
    .map((item) => item.replace(/["“”]/g, "").trim())
    .filter(Boolean);
}

function clampScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) return null;
  return Math.max(4, Math.min(9, Math.round(score * 2) / 2));
}
