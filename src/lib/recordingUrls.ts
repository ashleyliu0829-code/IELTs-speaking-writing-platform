import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Signs private storage objects for playback.
 *
 * Signing used to happen one object at a time inside a Promise.all, so opening
 * a student's grading page fired a separate storage request for every recording
 * across every submission at once. Past a few dozen that exhausts the pool and
 * the calls come back "Too many connections issued to the database" — which
 * reached the teacher as an unplayable recording, and did so unpredictably,
 * since which ones failed depended on what won the race.
 *
 * Batch signing turns that into one request per chunk.
 */

/** Supabase rejects very large batches, and chunking keeps one failure small. */
const chunkSize = 100;

export async function signRecordingUrls(
  storage: SupabaseClient,
  bucket: string,
  storagePaths: string[],
  expiresInSeconds = 60 * 60
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const paths = [...new Set(storagePaths.filter(Boolean))];
  if (!paths.length) return signed;

  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const { data, error } = await storage.storage.from(bucket).createSignedUrls(chunk, expiresInSeconds);

    if (error) {
      console.error(`Signing ${chunk.length} objects in ${bucket} failed:`, error.message);
      continue;
    }

    for (const item of data || []) {
      if (!item.path) continue;
      if (item.error || !item.signedUrl) {
        // A missing object is a data problem, not a transient one: the row
        // points at a file the bucket does not have.
        console.error(`Signing ${bucket}/${item.path} failed:`, item.error || "no URL returned");
        continue;
      }
      signed.set(item.path, item.signedUrl);
    }
  }

  return signed;
}

/** Single-object convenience for the few places that sign exactly one path. */
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

  const signed = await signRecordingUrls(storage, bucket, [storagePath], expiresInSeconds);
  return signed.get(storagePath);
}
