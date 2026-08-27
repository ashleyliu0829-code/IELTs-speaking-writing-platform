#!/usr/bin/env node
//
// Reports which recording rows point at storage objects that are not there.
//
//   node scripts/audit-recordings.mjs
//
// Read-only: it signs each path and records which ones the bucket rejects.
// Nothing is written or deleted.

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

const bucket = env.SUPABASE_RECORDINGS_BUCKET || "speaking-recordings";
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkTable(table, label) {
  const { data, error } = await supabase
    .from(table)
    .select("id, storage_path, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Could not read ${table}: ${error.message}`);
    return { present: [], missing: [] };
  }

  const rows = data || [];
  const present = [];
  const missing = [];

  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrls(
        chunk.map((row) => row.storage_path),
        60
      );

    if (signError) {
      console.error(`Signing a chunk of ${label} failed: ${signError.message}`);
      continue;
    }

    const byPath = new Map((signed || []).map((item) => [item.path, item]));
    for (const row of chunk) {
      const result = byPath.get(row.storage_path);
      if (result?.signedUrl && !result.error) present.push(row);
      else missing.push({ ...row, reason: result?.error || "unknown" });
    }
  }

  return { present, missing };
}

for (const [table, label] of [
  ["recordings", "homework recordings"],
  ["speaking_practice_recordings", "practice recordings"],
  ["teacher_demo_recordings", "teacher demos"]
]) {
  const { present, missing } = await checkTable(table, label);
  const total = present.length + missing.length;
  console.log(`\n=== ${label} (${table}) ===`);
  console.log(`  total rows : ${total}`);
  console.log(`  playable   : ${present.length}`);
  console.log(`  missing    : ${missing.length}`);

  if (missing.length) {
    const oldest = missing[0];
    const newest = missing[missing.length - 1];
    console.log(`  missing range: ${oldest.created_at} .. ${newest.created_at}`);
    if (present.length) {
      console.log(`  newest playable: ${present[present.length - 1].created_at}`);
    }
    console.log("  sample missing paths:");
    for (const row of missing.slice(0, 5)) console.log(`    ${row.storage_path}`);
  }
}
