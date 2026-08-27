import type { SupabaseClient } from "@supabase/supabase-js";
import { recordingsBucket } from "@/lib/supabase";
import { signRecordingUrl } from "@/lib/recordingUrls";
import type { Recording, TeacherDemoRecording } from "@/lib/types";

export async function attachTeacherDemos(supabase: SupabaseClient, recordings: Recording[]) {
  if (!recordings.length) return recordings;

  const recordingIds = recordings.map((recording) => recording.id);
  const { data: demos } = await supabase
    .from("teacher_demo_recordings")
    .select("*")
    .in("recording_id", recordingIds);

  const signedDemos = await Promise.all(
    ((demos || []) as TeacherDemoRecording[]).map(async (demo) => ({
      ...demo,
      signed_url: await signRecordingUrl(supabase, recordingsBucket, demo.storage_path)
    }))
  );

  const demosByRecordingId = new Map(signedDemos.map((demo) => [demo.recording_id, demo]));
  return recordings.map((recording) => ({
    ...recording,
    teacher_demo: demosByRecordingId.get(recording.id) || null
  }));
}
