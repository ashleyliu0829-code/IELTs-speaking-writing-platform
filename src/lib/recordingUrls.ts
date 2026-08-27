import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Signs a private storage object for playback.
 *
 * Every call site used to drop the error from createSignedUrl and return
 * undefined, which surfaced as "录音链接暂时不可用" in the UI with nothing in the
 * logs to say why. Failures are logged here instead, so a missing object or a
 * bucket misconfiguration is visible rather than silent.
 */
export async function signRecordingUrl(
  storage: SupabaseClient,
  bucket: string,
  storagePath: string,
  expiresInSeconds = 60 * 60
) {
  if (!storagePath) {
    console.error(`Cannot sign a recording with no storage_path (bucket ${bucket}).`);
    return undefined;
  }

  const { data, error } = await storage.storage.from(bucket).createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    console.error(`Signing ${bucket}/${storagePath} failed:`, error.message);
    return undefined;
  }

  if (!data?.signedUrl) {
    console.error(`Signing ${bucket}/${storagePath} returned no URL.`);
    return undefined;
  }

  return data.signedUrl;
}
