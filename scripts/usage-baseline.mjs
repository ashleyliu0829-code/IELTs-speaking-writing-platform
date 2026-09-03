#!/usr/bin/env node
//
// What a teacher actually consumes, measured from real submissions.
//
//   node scripts/usage-baseline.mjs
//
// Read-only. Used to set quota defaults from observed use rather than a guess.

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

const { data: recordings } = await supabase
  .from("recordings")
  .select("id, submission_id, duration_seconds, created_at, submissions(student_name)")
  .order("created_at", { ascending: true });

const rows = recordings || [];
if (!rows.length) {
  console.log("No recordings yet.");
  process.exit(0);
}

const monthKey = (value) => (value || "").slice(0, 7);
const byMonth = new Map();
const bySubmission = new Map();
const students = new Set();

for (const row of rows) {
  const month = monthKey(row.created_at);
  const bucket = byMonth.get(month) || { seconds: 0, count: 0, submissions: new Set(), students: new Set() };
  const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions;

  bucket.seconds += row.duration_seconds || 0;
  bucket.count += 1;
  bucket.submissions.add(row.submission_id);
  if (submission?.student_name) {
    bucket.students.add(submission.student_name.trim().toLowerCase());
    students.add(submission.student_name.trim().toLowerCase());
  }
  byMonth.set(month, bucket);

  bySubmission.set(row.submission_id, (bySubmission.get(row.submission_id) || 0) + (row.duration_seconds || 0));
}

console.log("=== per month ===");
for (const [month, bucket] of [...byMonth.entries()].sort()) {
  console.log(
    `  ${month}: ${Math.round(bucket.seconds / 60)} min across ${bucket.count} recordings, ` +
      `${bucket.submissions.size} submissions, ${bucket.students.size} students`
  );
}

const submissionSeconds = [...bySubmission.values()].sort((a, b) => a - b);
const median = submissionSeconds[Math.floor(submissionSeconds.length / 2)] || 0;
const p90 = submissionSeconds[Math.floor(submissionSeconds.length * 0.9)] || 0;
const durations = rows.map((row) => row.duration_seconds || 0).sort((a, b) => a - b);

console.log("\n=== per submission (one homework by one student) ===");
console.log(`  submissions   : ${submissionSeconds.length}`);
console.log(`  median        : ${Math.round(median / 60)} min ${Math.round(median % 60)} s`);
console.log(`  90th pct      : ${Math.round(p90 / 60)} min ${Math.round(p90 % 60)} s`);
console.log(`  longest       : ${Math.round(submissionSeconds[submissionSeconds.length - 1] / 60)} min`);

console.log("\n=== per recording ===");
console.log(`  median        : ${durations[Math.floor(durations.length / 2)]} s`);
console.log(`  90th pct      : ${durations[Math.floor(durations.length * 0.9)]} s`);

const totalMinutes = Math.round(rows.reduce((sum, row) => sum + (row.duration_seconds || 0), 0) / 60);
console.log(`\n=== overall ===`);
console.log(`  distinct students : ${students.size}`);
console.log(`  total audio       : ${totalMinutes} min across ${rows.length} recordings`);

// Storage actually consumed.
const { data: buckets } = await supabase.storage.listBuckets();
for (const bucket of buckets || []) {
  if (!bucket.name.includes("recording")) continue;
  console.log(`\n  (bucket ${bucket.name} exists; size not reported by the API)`);
}
