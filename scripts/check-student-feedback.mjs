#!/usr/bin/env node
//
// Checks whether a student can actually read published feedback.
//
//   node scripts/check-student-feedback.mjs
//
// Read-only. Signs a JWT for a real student account and runs the same query
// the student portal runs, so RLS applies exactly as it does in the app.

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(account) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    role: "authenticated",
    aud: "authenticated",
    sub: account.id,
    iat: issuedAt,
    exp: issuedAt + 300,
    account_id: account.id,
    account_role: account.role,
    teacher_id: account.role === "teacher" ? account.id : account.teacher_id,
    display_name: account.display_name
  };
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signature = createHmac("sha256", env.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function clientFor(account) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${signJwt(account)}` } }
  });
}

// A submission that has published feedback.
const { data: published } = await admin
  .from("feedback")
  .select("id, submission_id, published_at, submissions(id, student_name, teacher_id)")
  .not("published_at", "is", null)
  .order("published_at", { ascending: false })
  .limit(3);

console.log(`Published feedback rows: ${published?.length || 0}`);
if (!published?.length) {
  console.log("Nothing published yet, so there is nothing for a student to see.");
  process.exit(0);
}

for (const row of published) {
  const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions;
  console.log(`\n=== feedback ${row.id} ===`);
  console.log(`  submission   : ${row.submission_id}`);
  console.log(`  student_name : ${submission?.student_name}`);
  console.log(`  published_at : ${row.published_at}`);

  const { data: account } = await admin
    .from("accounts")
    .select("id, role, phone, display_name, teacher_id")
    .eq("role", "student")
    .ilike("display_name", submission?.student_name || "")
    .maybeSingle();

  if (!account) {
    console.log("  ! no student account matches that submission name");
    continue;
  }

  console.log(`  account      : ${account.display_name} (teacher_id ${account.teacher_id})`);
  console.log(`  submission teacher_id: ${submission?.teacher_id}`);

  const asStudent = clientFor(account);

  const { data: seenSubmission, error: subError } = await asStudent
    .from("submissions")
    .select("id")
    .eq("id", row.submission_id)
    .maybeSingle();
  console.log(`  can read submission: ${seenSubmission ? "yes" : "NO"}${subError ? ` (${subError.message})` : ""}`);

  const { data: seenFeedback, error: fbError } = await asStudent
    .from("feedback")
    .select("id, published_at")
    .eq("submission_id", row.submission_id)
    .maybeSingle();
  console.log(`  can read feedback  : ${seenFeedback ? "yes" : "NO"}${fbError ? ` (${fbError.message})` : ""}`);

  const { data: nested } = await asStudent
    .from("submissions")
    .select("id, feedback(*)")
    .eq("id", row.submission_id)
    .maybeSingle();
  const nestedFeedback = nested?.feedback;
  console.log(
    `  nested feedback    : ${Array.isArray(nestedFeedback) ? nestedFeedback.length : nestedFeedback ? 1 : 0} row(s)`
  );
}

// Replicate the exact query /api/student/history runs.
console.log("\n=== replicating /api/student/history ===");
const { data: testAccount } = await admin
  .from("accounts")
  .select("id, role, phone, display_name, teacher_id")
  .eq("role", "student")
  .ilike("display_name", "YvetteZhou")
  .maybeSingle();

if (testAccount) {
  const asStudent = clientFor(testAccount);
  const { data, error } = await asStudent
    .from("submissions")
    .select("*, assignments(id, title), recordings(*), writing_responses(*), feedback(*)")
    .ilike("student_name", testAccount.display_name)
    .order("submitted_at", { ascending: false });

  console.log(`  student: ${testAccount.display_name}`);
  console.log(`  error  : ${error?.message || "none"}`);
  console.log(`  rows   : ${data?.length || 0}`);
  const withFeedback = (data || []).filter((row) => {
    const fb = Array.isArray(row.feedback) ? row.feedback[0] : row.feedback;
    return fb?.published_at;
  });
  console.log(`  with published feedback: ${withFeedback.length}`);
  for (const row of withFeedback.slice(0, 3)) {
    const fb = Array.isArray(row.feedback) ? row.feedback[0] : row.feedback;
    console.log(`    submission ${row.id.slice(0, 8)} -> published ${fb.published_at}`);
  }
}
