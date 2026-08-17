import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { checkQuota, estimateStorageCostMicros, maxAudioBytes, recordUsage } from "@/lib/usage";
import type { TeacherDemoRecording } from "@/lib/types";

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;
  const storage = getSupabaseAdmin();

  const formData = await request.formData();
  const recordingId = String(formData.get("recordingId") || "");
  const duration = Number(formData.get("duration") || 0);
  const audio = formData.get("audio");

  if (!recordingId) {
    return Response.json({ error: "Missing recordingId." }, { status: 400 });
  }

  if (!(audio instanceof File)) {
    return Response.json({ error: "Please choose an audio file for the sample answer." }, { status: 400 });
  }

  if (audio.size > maxAudioBytes) {
    return Response.json({ error: `示范录音不能超过 ${maxAudioBytes / 1024 / 1024} MB。` }, { status: 413 });
  }

  const quotaError = await checkQuota(teacher.id, "storage_upload", audio.size);
  if (quotaError) return Response.json({ error: quotaError }, { status: 429 });

  // RLS reaches recordings through their submission, so a miss means "not yours".
  const { data: recording, error: recordingError } = await supabase
    .from("recordings")
    .select("id")
    .eq("id", recordingId)
    .maybeSingle();

  if (recordingError) return Response.json({ error: recordingError.message }, { status: 500 });
  if (!recording) return Response.json({ error: "Student recording not found." }, { status: 404 });

  const path = `teacher-demos/${recordingId}.${audioExtension(audio.type)}`;
  const buffer = Buffer.from(await audio.arrayBuffer());
  const { error: uploadError } = await storage.storage.from(recordingsBucket).upload(path, buffer, {
    contentType: audio.type || "audio/webm",
    upsert: true
  });

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

  await recordUsage({
    teacherId: teacher.id,
    accountId: teacher.id,
    eventType: "storage_upload",
    quantity: audio.size,
    unit: "bytes",
    costMicros: estimateStorageCostMicros(audio.size),
    metadata: { bucket: recordingsBucket, path }
  });

  const { data: demo, error: demoError } = await supabase
    .from("teacher_demo_recordings")
    .upsert(
      {
        recording_id: recordingId,
        storage_path: path,
        duration_seconds: duration
      },
      { onConflict: "recording_id" }
    )
    .select("*")
    .single<TeacherDemoRecording>();

  if (demoError || !demo) {
    return Response.json({ error: demoError?.message || "Could not save sample answer." }, { status: 500 });
  }

  const { data: signed } = await storage.storage.from(recordingsBucket).createSignedUrl(path, 60 * 60);
  return Response.json({ demo: { ...demo, signed_url: signed?.signedUrl } });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;
  const storage = getSupabaseAdmin();

  const recordingId = request.nextUrl.searchParams.get("recordingId");
  if (!recordingId) {
    return Response.json({ error: "Missing recordingId." }, { status: 400 });
  }

  const { data: recording } = await supabase.from("recordings").select("id").eq("id", recordingId).maybeSingle();
  if (!recording) return Response.json({ error: "Student recording not found." }, { status: 404 });

  const { data: demo, error: demoError } = await supabase
    .from("teacher_demo_recordings")
    .select("*")
    .eq("recording_id", recordingId)
    .maybeSingle<TeacherDemoRecording>();

  if (demoError) return Response.json({ error: demoError.message }, { status: 500 });

  if (demo?.storage_path) {
    const { error: storageError } = await storage.storage.from(recordingsBucket).remove([demo.storage_path]);
    if (storageError) return Response.json({ error: storageError.message }, { status: 500 });
  }

  const { error } = await supabase.from("teacher_demo_recordings").delete().eq("recording_id", recordingId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
