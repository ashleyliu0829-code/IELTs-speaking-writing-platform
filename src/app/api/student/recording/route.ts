import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { checkQuota, estimateStorageCostMicros, maxAudioBytes, recordUsage } from "@/lib/usage";

const itemSchema = z.object({
  key: z.string(),
  label: z.string(),
  question: z.string()
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const assignmentId = String(formData.get("assignmentId") || "");
  const submissionId = cleanUuid(String(formData.get("submissionId") || ""));
  const item = itemSchema.parse(JSON.parse(String(formData.get("item") || "{}")));
  const audio = formData.get("audio");

  if (!assignmentId || !submissionId) {
    return Response.json({ error: "Missing assignment or submission." }, { status: 400 });
  }

  if (!(audio instanceof File)) {
    return Response.json({ error: `Missing recording for ${item.label}.` }, { status: 400 });
  }

  if (audio.size > maxAudioBytes) {
    return Response.json({ error: `录音不能超过 ${maxAudioBytes / 1024 / 1024} MB。` }, { status: 413 });
  }

  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;
  const storage = getSupabaseAdmin();

  const quotaError = await checkQuota(account.teacher_id || null, "storage_upload", audio.size);
  if (quotaError) return Response.json({ error: quotaError }, { status: 429 });

  // RLS scopes this to the caller's workspace, so a miss means "not yours".
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, assignment_id, teacher_id")
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (!submission) {
    return Response.json({ error: "Submission not found." }, { status: 404 });
  }

  const duration = Number(formData.get("duration") || 0);
  const path = `${assignmentId}/${submissionId}/${item.key}.${audioExtension(audio.type)}`;
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: uploadError } = await storage.storage.from(recordingsBucket).upload(path, buffer, {
    contentType: audio.type || "audio/webm",
    upsert: true
  });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  await recordUsage({
    teacherId: account.teacher_id || null,
    accountId: account.id,
    eventType: "storage_upload",
    quantity: audio.size,
    unit: "bytes",
    costMicros: estimateStorageCostMicros(audio.size),
    metadata: { bucket: recordingsBucket, path }
  });

  await supabase.from("recordings").delete().eq("submission_id", submissionId).eq("question_key", item.key);

  const { error: recordingError } = await supabase.from("recordings").insert({
    submission_id: submissionId,
    question_key: item.key,
    question_label: item.label,
    question_text: item.question,
    transcript_text: "",
    corrected_transcript_text: "",
    storage_path: path,
    duration_seconds: duration
  });

  if (recordingError) {
    return Response.json({ error: recordingError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

function cleanUuid(value: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned === "null" || cleaned === "undefined") return "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned) ? cleaned : "";
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}
