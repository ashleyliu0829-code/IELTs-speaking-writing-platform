import type { SupabaseClient } from "@supabase/supabase-js";
import { recordingsBucket } from "@/lib/supabase";
import type { Recording, TeacherDemoRecording } from "@/lib/types";

export async function attachTeacherDemos(supabase: SupabaseClient, recordings: Recording[]) {
  if (!recordings.length) return recordings;

  const recordingIds = recordings.map((recording) => recording.id);
  const { data: demos } = await supabase
    .from("teacher_demo_recordings")
    .select("*")
    .in("recording_id", recordingIds);

  const signedDemos = await Promise.all(
    ((demos || []) as TeacherDemoRecording[]).map(async (demo) => {
      const { data: signed } = await supabase.storage
        .from(recordingsBucket)
        .createSignedUrl(demo.storage_path, 60 * 60);
      return { ...demo, signed_url: signed?.signedUrl };
    })
  );

  const demosByRecordingId = new Map(signedDemos.map((demo) => [demo.recording_id, demo]));
  return recordings.map((recording) => ({
    ...recording,
    teacher_demo: demosByRecordingId.get(recording.id) || null
  }));
}
