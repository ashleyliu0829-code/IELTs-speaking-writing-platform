#!/usr/bin/env node
//
// Issues (or re-issues) an activation code for one teacher.
//
//   node scripts/issue-activation-code.mjs 13800138000
//
// Use it for accounts that registered before activation existed, or when a
// teacher loses the code. Re-issuing replaces the old code and, if the account
// was already active, deactivates it until the new code is entered.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

// Kept in step with src/lib/activation.ts: same alphabet, same shape.
const alphabet = "ACDEFGHJKMNPQRTUVWXY34679";
const generateActivationCode = () =>
  Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("")
  ).join("-");

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

const phone = (process.argv[2] || "").replace(/[^\d+]/g, "");
if (!phone) {
  console.error("Usage: node scripts/issue-activation-code.mjs <手机号>");
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const { data: account } = await supabase
  .from("accounts")
  .select("id, display_name, phone, activated_at")
  .eq("role", "teacher")
  .eq("phone", phone)
  .maybeSingle();

if (!account) {
  console.error(`No teacher account with phone ${phone}.`);
  process.exit(1);
}

const code = generateActivationCode();
const { error } = await supabase
  .from("accounts")
  .update({ activation_code: code, activated_at: null })
  .eq("id", account.id);

if (error) {
  console.error(`Could not issue a code: ${error.message}`);
  process.exit(1);
}

console.log(`${account.display_name}  ${account.phone}`);
console.log(`授权码 ${code}`);
if (account.activated_at) console.log("注意：该账号原本已激活，现已重置，需要用新码重新激活。");
