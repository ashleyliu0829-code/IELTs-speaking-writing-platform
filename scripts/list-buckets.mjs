#!/usr/bin/env node
//
// Lists every storage bucket and samples what is inside it.
//
//   node scripts/list-buckets.mjs
//
// Read-only. Used to check whether recordings that look lost are simply
// sitting in a bucket the app is no longer pointed at.

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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const { data: buckets, error } = await supabase.storage.listBuckets();
if (error) {
  console.error("Could not list buckets:", error.message);
  process.exit(1);
}

console.log(`App is configured to use: ${env.SUPABASE_RECORDINGS_BUCKET || "speaking-recordings"}\n`);

for (const bucket of buckets || []) {
  const { data: top } = await supabase.storage.from(bucket.name).list("", { limit: 1000 });
  const entries = top || [];
  // A storage "folder" is an entry with no id.
  const folders = entries.filter((entry) => !entry.id);
  const files = entries.filter((entry) => entry.id);

  console.log(`=== ${bucket.name} ${bucket.public ? "(public)" : "(private)"} ===`);
  console.log(`  created    : ${bucket.created_at}`);
  console.log(`  top level  : ${folders.length} folders, ${files.length} files`);

  // Count what is actually stored a level down, where recordings live.
  let nested = 0;
  let oldest = null;
  let newest = null;
  for (const folder of folders.slice(0, 40)) {
    const { data: inner } = await supabase.storage.from(bucket.name).list(folder.name, { limit: 1000 });
    for (const entry of inner || []) {
      if (entry.id) {
        nested += 1;
        const at = entry.created_at;
        if (at && (!oldest || at < oldest)) oldest = at;
        if (at && (!newest || at > newest)) newest = at;
      } else {
        const { data: deeper } = await supabase.storage
          .from(bucket.name)
          .list(`${folder.name}/${entry.name}`, { limit: 1000 });
        for (const file of deeper || []) {
          if (!file.id) continue;
          nested += 1;
          const at = file.created_at;
          if (at && (!oldest || at < oldest)) oldest = at;
          if (at && (!newest || at > newest)) newest = at;
        }
      }
    }
  }

  console.log(`  files found: ${nested}${folders.length > 40 ? " (sampled first 40 folders)" : ""}`);
  if (oldest) console.log(`  oldest file: ${oldest}`);
  if (newest) console.log(`  newest file: ${newest}`);
  console.log("");
}
