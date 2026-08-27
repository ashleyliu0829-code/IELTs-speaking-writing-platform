#!/usr/bin/env node
//
// Copies objects from the old `recordings` bucket into the bucket the app now
// uses, so recordings uploaded before the bucket name changed play again.
//
//   node scripts/merge-recording-buckets.mjs --dry-run   # report only
//   node scripts/merge-recording-buckets.mjs             # copy
//
// Copies, never moves: the source bucket is left untouched as a fallback.
// Objects already present in the destination are skipped, so it is safe to
// re-run after an interruption.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    })
);

const dryRun = process.argv.includes("--dry-run");
const sourceBucket = process.env.SOURCE_BUCKET || "recordings";
const targetBucket = env.SUPABASE_RECORDINGS_BUCKET || "speaking-recordings";

if (sourceBucket === targetBucket) {
  console.error("Source and target are the same bucket; nothing to do.");
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/** Storage has no recursive list, so walk the prefixes. */
async function listAll(bucket, prefix = "") {
  const found = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) {
    console.error(`Listing ${bucket}/${prefix} failed: ${error.message}`);
    return found;
  }

  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) found.push({ path, size: entry.metadata?.size ?? 0 });
    else found.push(...(await listAll(bucket, path)));
  }

  return found;
}

console.log(`Source: ${sourceBucket}`);
console.log(`Target: ${targetBucket}`);
console.log(dryRun ? "Mode:   dry run\n" : "Mode:   copying\n");

const sourceObjects = await listAll(sourceBucket);
const targetObjects = new Set((await listAll(targetBucket)).map((object) => object.path));

const toCopy = sourceObjects.filter((object) => !targetObjects.has(object.path));
const totalBytes = toCopy.reduce((sum, object) => sum + object.size, 0);

console.log(`  in source        : ${sourceObjects.length}`);
console.log(`  already in target: ${sourceObjects.length - toCopy.length}`);
console.log(`  to copy          : ${toCopy.length} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)\n`);

if (dryRun || !toCopy.length) {
  if (!toCopy.length) console.log("Nothing to copy.");
  process.exit(0);
}

let copied = 0;
const failures = [];

for (const object of toCopy) {
  const { data, error } = await supabase.storage.from(sourceBucket).download(object.path);
  if (error || !data) {
    failures.push({ path: object.path, reason: error?.message || "download returned nothing" });
    continue;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from(targetBucket).upload(object.path, buffer, {
    contentType: data.type || "audio/webm",
    upsert: false
  });

  if (uploadError) {
    failures.push({ path: object.path, reason: uploadError.message });
    continue;
  }

  copied += 1;
  if (copied % 25 === 0) console.log(`  copied ${copied}/${toCopy.length}`);
}

console.log(`\nCopied ${copied}/${toCopy.length}.`);
if (failures.length) {
  console.log(`Failed ${failures.length}:`);
  for (const failure of failures.slice(0, 10)) console.log(`  ${failure.path}: ${failure.reason}`);
}
