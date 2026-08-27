import type { SupabaseClient } from "@supabase/supabase-js";
import { recordingsBucket } from "@/lib/supabase";
import { signRecordingUrls } from "@/lib/recordingUrls";
import type { Recording, TeacherDemoRecording } from "@/lib/types";

export async function attachTeacherDemos(supabase: SupabaseClient, recordings: Recording[]) {
  if (!recordings.length) return recordings;

  const recordingIds = recordings.map((recording) => recording.id);
  const { data: demos } = await supabase
    .from("teacher_demo_recordings")
    .select("*")
    .in("recording_id", recordingIds);

  const demoRows = (demos || []) as TeacherDemoRecording[];
  const signedUrls = await signRecordingUrls(
    supabase,
    recordingsBucket,
    demoRows.map((demo) => demo.storage_path)
  );
  const signedDemos = demoRows.map((demo) => ({
    ...demo,
    signed_url: signedUrls.get(demo.storage_path)
  }));

  const demosByRecordingId = new Map(signedDemos.map((demo) => [demo.recording_id, demo]));
  return recordings.map((recording) => ({
    ...recording,
    teacher_demo: demosByRecordingId.get(recording.id) || null
  }));
}
