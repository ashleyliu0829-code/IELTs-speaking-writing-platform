#!/usr/bin/env node
//
// Lists teacher accounts with their activation codes.
//
//   node scripts/activation-codes.mjs            # pending only
//   node scripts/activation-codes.mjs --all      # including activated
//
// The codes are readable only with the service role, which is why this runs as
// a script rather than a page in the app: no admin login to build, and no admin
// surface to secure.

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

const showAll = process.argv.includes("--all");

const { data, error } = await supabase
  .from("accounts")
  .select("display_name, phone, activation_code, activated_at, created_at")
  .eq("role", "teacher")
  .order("created_at", { ascending: false });

if (error) {
  console.error(`Could not read accounts: ${error.message}`);
  process.exit(1);
}

const rows = (data || []).filter((row) => showAll || !row.activated_at);

if (!rows.length) {
  console.log(showAll ? "No teacher accounts." : "No teachers waiting for a code.");
  process.exit(0);
}

console.log(showAll ? "All teacher accounts:\n" : "Waiting for activation:\n");

for (const row of rows) {
  const registered = new Date(row.created_at).toLocaleString("zh-CN");
  console.log(`  ${row.display_name}  ${row.phone}`);
  console.log(`    注册于 ${registered}`);
  if (row.activated_at) {
    console.log(`    已激活 ${new Date(row.activated_at).toLocaleString("zh-CN")}`);
  } else {
    console.log(`    授权码 ${row.activation_code || "(未生成 — 见下方提示)"}`);
  }
  console.log("");
}

const missing = rows.filter((row) => !row.activated_at && !row.activation_code);
if (missing.length) {
  console.log(`${missing.length} 个账号注册于本功能上线之前，没有授权码。`);
  console.log("运行 node scripts/issue-activation-code.mjs <手机号> 为其补发。");
}
