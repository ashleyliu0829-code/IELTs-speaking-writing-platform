import { NextRequest } from "next/server";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";

const itemSchema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    question: z.string()
  })
);

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const assignmentId = String(formData.get("assignmentId") || "");
  const studentName = String(formData.get("studentName") || "").trim();
  const items = itemSchema.parse(JSON.parse(String(formData.get("items") || "[]")));

  if (!assignmentId || !studentName) {
    return Response.json({ error: "Missing assignment or student name." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: assignment } = await supabase.from("assignments").select("id").eq("id", assignmentId).eq("is_active", true).single();
  if (!assignment) {
    return Response.json({ error: "Assignment not found." }, { status: 404 });
  }

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .insert({ assignment_id: assignmentId, student_name: studentName })
    .select("id")
    .single();

  if (submissionError || !submission) {
    return Response.json({ error: submissionError?.message || "Could not create submission." }, { status: 500 });
  }

  for (const item of items) {
    const audio = formData.get(`audio_${item.key}`);
    if (!(audio instanceof File)) {
      return Response.json({ error: `Missing recording for ${item.label}.` }, { status: 400 });
    }

    const duration = Number(formData.get(`duration_${item.key}`) || 0);
    const path = `${assignmentId}/${submission.id}/${item.key}.webm`;
    const buffer = Buffer.from(await audio.arrayBuffer());
    const transcriptText = await transcribeAudio(buffer, item.key, audio.type || "audio/webm");

    const { error: uploadError } = await supabase.storage.from(recordingsBucket).upload(path, buffer, {
      contentType: audio.type || "audio/webm",
      upsert: true
    });

    if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

    const { error: recordingError } = await supabase.from("recordings").insert({
      submission_id: submission.id,
      question_key: item.key,
      question_label: item.label,
      question_text: item.question,
      transcript_text: transcriptText,
      storage_path: path,
      duration_seconds: duration
    });

    if (recordingError) return Response.json({ error: recordingError.message }, { status: 500 });
  }

  return Response.json({ submissionId: submission.id });
}

async function transcribeAudio(buffer: Buffer, key: string, contentType: string) {
  if (!process.env.OPENAI_API_KEY) return "";

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = await toFile(buffer, `${key}.webm`, { type: contentType });
    const transcript = await openai.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1"
    });
    return transcript.text || "";
  } catch (error) {
    console.error("Transcription failed during student submission", error);
    return "";
  }
}
