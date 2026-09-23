#!/usr/bin/env node
//
// Delete expired trial workspaces and everything in them.
//
//   node scripts/prune-demos.mjs          # list what would go
//   node scripts/prune-demos.mjs --yes    # delete it
//
// Meant for a nightly cron on the server. Accounts cascade to their sessions,
// students, assignments and submissions, so the only thing needing its own
// pass is the audio in storage, which no foreign key reaches.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const bucket = env.SUPABASE_RECORDINGS_BUCKET || "recordings";
const commit = process.argv.includes("--yes");

const { data: expired, error } = await sb
  .from("accounts")
  .select("id, display_name, created_at, demo_expires_at")
  .eq("is_demo", true)
  .lt("demo_expires_at", new Date().toISOString());
if (error) throw new Error(error.message);

if (!expired.length) {
  console.log("No expired trials.");
  process.exit(0);
}

for (const account of expired) {
  const { data: submissions } = await sb.from("submissions").select("id").eq("teacher_id", account.id);
  const ids = (submissions || []).map((row) => row.id);
  let paths = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: recordings } = await sb.from("recordings").select("storage_path").in("submission_id", ids.slice(i, i + 100));
    paths = paths.concat((recordings || []).map((row) => row.storage_path).filter(Boolean));
  }

  console.log(`${commit ? "deleting" : "would delete"} ${account.id} ${account.display_name} — expired ${account.demo_expires_at?.slice(0, 10)}, ${ids.length} submissions, ${paths.length} recordings`);
  if (!commit) continue;

  if (paths.length) {
    const { error: removeError } = await sb.storage.from(bucket).remove(paths);
    if (removeError) console.error(`  storage: ${removeError.message}`);
  }
  const { error: deleteError } = await sb.from("accounts").delete().eq("id", account.id);
  if (deleteError) console.error(`  account: ${deleteError.message}`);
}

console.log(commit ? `Done: ${expired.length} trials removed.` : `\n${expired.length} trials would be removed. Re-run with --yes.`);
