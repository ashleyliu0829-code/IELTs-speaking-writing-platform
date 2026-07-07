import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";

const itemSchema = z.object({
  key: z.string(),
  label: z.string(),
  question: z.string()
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const assignmentId = String(formData.get("assignmentId") || "");
  const submissionId = String(formData.get("submissionId") || "");
  const item = itemSchema.parse(JSON.parse(String(formData.get("item") || "{}")));
  const audio = formData.get("audio");

  if (!assignmentId || !submissionId) {
    return Response.json({ error: "Missing assignment or submission." }, { status: 400 });
  }

  if (!(audio instanceof File)) {
    return Response.json({ error: `Missing recording for ${item.label}.` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, assignment_id")
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .single();

  if (!submission) {
    return Response.json({ error: "Submission not found." }, { status: 404 });
  }

  const duration = Number(formData.get("duration") || 0);
  const path = `${assignmentId}/${submissionId}/${item.key}.webm`;
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(recordingsBucket).upload(path, buffer, {
    contentType: audio.type || "audio/webm",
    upsert: true
  });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  await supabase.from("recordings").delete().eq("submission_id", submissionId).eq("question_key", item.key);

  const { error: recordingError } = await supabase.from("recordings").insert({
    submission_id: submissionId,
    question_key: item.key,
    question_label: item.label,
    question_text: item.question,
    transcript_text: "",
    storage_path: path,
    duration_seconds: duration
  });

  if (recordingError) {
    return Response.json({ error: recordingError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
