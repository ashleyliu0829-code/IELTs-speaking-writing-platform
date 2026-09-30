#!/usr/bin/env node
//
// Reset one account's password from the operator's side.
//
//   node scripts/reset-password.mjs <phone>          # show who it is, change nothing
//   node scripts/reset-password.mjs <phone> --yes    # issue a temporary password
//
// The teacher-facing reset (/api/teacher/student-password) only reaches a
// teacher's own students, which is right for them and not enough for the
// operator: a teacher who has lost their own password, or a student whose
// teacher cannot be reached, has nowhere else to go. Same temporary-password
// alphabet, same dropping of existing sessions.
//
// Passwords are salted hashes and cannot be read back, so this issues a new
// one — it never recovers the old.

import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const phone = process.argv[2];
const commit = process.argv.includes("--yes");
if (!phone) {
  console.error("Usage: node scripts/reset-password.mjs <phone> [--yes]");
  process.exit(1);
}

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

// Numbers are stored with and without a country code, so match on the digits.
const digits = phone.replace(/\D/g, "");
const { data: accounts, error } = await sb.from("accounts").select("id, role, display_name, phone, teacher_id, created_at, last_login_at");
if (error) throw new Error(error.message);
const matches = accounts.filter((account) => (account.phone || "").replace(/\D/g, "").endsWith(digits));

if (!matches.length) {
  console.error(`No account with phone ending ${digits}.`);
  process.exit(1);
}
if (matches.length > 1) {
  console.error(`${matches.length} accounts match — be more specific:`);
  for (const account of matches) console.error(`  ${account.phone}  ${account.role}  ${account.display_name}`);
  process.exit(1);
}

const [account] = matches;
const teacher = accounts.find((row) => row.id === account.teacher_id);
console.log(`${account.role === "student" ? "学生" : account.role === "teacher" ? "老师" : "助教"}「${account.display_name}」 ${account.phone}`);
if (account.role !== "teacher") console.log(`归属老师：${teacher ? `${teacher.display_name} ${teacher.phone}` : "（无）"}`);
console.log(`注册 ${account.created_at?.slice(0, 10)}，最近登录 ${account.last_login_at?.slice(0, 16).replace("T", " ") || "从未"}`);

if (!commit) {
  console.log("\n未做改动。确认无误后加 --yes 重新运行。");
  process.exit(0);
}

// Readable on a phone screen: no 0/O or 1/l/I to mistake.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const password = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");

const { error: updateError } = await sb.from("accounts").update({ password_hash: hash, password_salt: salt }).eq("id", account.id);
if (updateError) throw new Error(updateError.message);

// Whoever held the old password is signed out.
const { error: sessionError } = await sb.from("account_sessions").delete().eq("account_id", account.id);
if (sessionError) console.error(`sessions: ${sessionError.message}`);

console.log(`\n临时密码：${password}`);
console.log("已清除该账号的登录状态。请转告本人尽快登录后自行修改密码。");
