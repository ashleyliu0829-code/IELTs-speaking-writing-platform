#!/usr/bin/env node
//
// Delete expired trial workspaces and everything in them.
//
//   node scripts/prune-demos.mjs          # list what would go
//   node scripts/prune-demos.mjs --yes    # delete it
//   node scripts/prune-demos.mjs --all --yes   # every trial, expired or not
//
// Meant for a nightly cron on the server.
//
// Deleting the account is not enough, and does not even work: `students`
// has `teacher_id` NOT NULL behind a foreign key declared `on delete set
// null`, so Postgres refuses the delete rather than orphaning the row. The
// workspace is therefore emptied table by table first, children before
// parents, and the account goes last. Every step is checked — a silent
// failure here means trials pile up for ever.

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
const everything = process.argv.includes("--all");

let query = sb.from("accounts").select("id, display_name, created_at, demo_expires_at").eq("is_demo", true).eq("role", "teacher");
if (!everything) query = query.lt("demo_expires_at", new Date().toISOString());
const { data: workspaces, error } = await query;
if (error) throw new Error(error.message);

if (!workspaces.length) {
  console.log(everything ? "No trials." : "No expired trials.");
  process.exit(0);
}

let failed = 0;
for (const workspace of workspaces) {
  const submissionIds = await ids("submissions", "teacher_id", workspace.id);
  const slotIds = await ids("lesson_slots", "teacher_id", workspace.id);
  const paths = await recordingPaths(submissionIds);

  console.log(
    `${commit ? "deleting" : "would delete"} ${workspace.id.slice(0, 8)} — opened ${workspace.created_at.slice(0, 10)}, ` +
      `expires ${workspace.demo_expires_at?.slice(0, 10)}, ${submissionIds.length} submissions, ${paths.length} recordings`
  );
  if (!commit) continue;

  if (paths.length) {
    const { error: storageError } = await sb.storage.from(bucket).remove(paths);
    if (storageError) console.error(`  storage: ${storageError.message}`);
  }

  // Children first. Anything whose foreign key cascades is listed anyway:
  // deleting it explicitly costs one call and removes the guesswork.
  if (submissionIds.length) {
    // teacher_demo_recordings cascades from recordings, so it goes with them.
    await wipeIn("recordings", "submission_id", submissionIds);
    await wipeIn("writing_responses", "submission_id", submissionIds);
    await wipeIn("feedback", "submission_id", submissionIds);
    await wipeIn("ai_assessments", "submission_id", submissionIds);
  }
  if (slotIds.length) await wipeIn("lesson_bookings", "slot_id", slotIds);

  const taskIds = await ids("daily_tasks", "teacher_id", workspace.id);
  if (taskIds.length) await wipeIn("daily_task_checkins", "task_id", taskIds);

  const practiceIds = await ids("speaking_practice_submissions", "teacher_id", workspace.id);
  if (practiceIds.length) await wipeIn("speaking_practice_recordings", "submission_id", practiceIds);

  for (const table of [
    "submissions",
    "assignments",
    "lesson_slots",
    "daily_tasks",
    "teacher_todos",
    "speaking_practice_submissions",
    "lesson_records",
    "usage_events",
    "students"
  ]) {
    await wipe(table, "teacher_id", workspace.id);
  }
  await wipe("teacher_usage_limits", "teacher_id", workspace.id);

  // The trial's own student account, then the workspace itself.
  await wipe("accounts", "teacher_id", workspace.id, `and role=eq.student`);
  const { error: accountError } = await sb.from("accounts").delete().eq("id", workspace.id);
  if (accountError) {
    console.error(`  account: ${accountError.message}`);
    failed += 1;
    continue;
  }

  const { count } = await sb.from("accounts").select("id", { count: "exact", head: true }).eq("id", workspace.id);
  if (count) {
    console.error(`  account: still present after delete`);
    failed += 1;
  }
}

console.log(
  commit
    ? `Done: ${workspaces.length - failed} of ${workspaces.length} trials removed.`
    : `\n${workspaces.length} trials would be removed. Re-run with --yes.`
);
if (failed) process.exitCode = 1;

async function ids(table, column, value) {
  const { data, error } = await sb.from(table).select("id").eq(column, value).limit(5000);
  if (error) {
    console.error(`  ${table}: ${error.message}`);
    return [];
  }
  return (data || []).map((row) => row.id);
}

async function recordingPaths(submissionIds) {
  const paths = [];
  for (let i = 0; i < submissionIds.length; i += 100) {
    const { data } = await sb.from("recordings").select("storage_path").in("submission_id", submissionIds.slice(i, i + 100));
    paths.push(...(data || []).map((row) => row.storage_path).filter(Boolean));
  }
  return paths;
}

async function wipe(table, column, value, extra) {
  let request = sb.from(table).delete().eq(column, value);
  if (extra) request = request.eq("role", "student");
  const { error: wipeError } = await request;
  if (wipeError) console.error(`  ${table}: ${wipeError.message}`);
}

async function wipeIn(table, column, values) {
  for (let i = 0; i < values.length; i += 100) {
    const { error: wipeError } = await sb.from(table).delete().in(column, values.slice(i, i + 100));
    if (wipeError) console.error(`  ${table}: ${wipeError.message}`);
  }
}
