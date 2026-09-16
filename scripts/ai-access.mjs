// Switch the AI features on or off for a teacher.
//
//   node scripts/ai-access.mjs <phone> on|off
//   node scripts/ai-access.mjs list
//
// Run locally (Node 22+); reads .env.local. The switch is accounts.ai_enabled,
// checked by the AI assessment and draft-feedback routes.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const [target, state] = process.argv.slice(2);

if (!target || target === "list") {
  const { data } = await supabase.from("accounts").select("display_name, phone, ai_enabled").eq("role", "teacher").order("created_at");
  for (const row of data || []) console.log(`${row.ai_enabled ? "ON " : "off"}  ${row.display_name.padEnd(14)} ${row.phone}`);
  process.exit(0);
}
if (state !== "on" && state !== "off") { console.error("usage: node scripts/ai-access.mjs <phone> on|off"); process.exit(1); }
const { data, error } = await supabase.from("accounts").update({ ai_enabled: state === "on" }).eq("role", "teacher").eq("phone", target).select("display_name");
if (error) { console.error(error.message); process.exit(1); }
if (!data?.length) { console.error("no teacher with that phone"); process.exit(1); }
console.log(`${data[0].display_name}: AI ${state}`);
