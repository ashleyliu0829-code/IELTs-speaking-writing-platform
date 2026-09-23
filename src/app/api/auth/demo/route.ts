import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createAccountSession, hashPassword, sessionCookieName } from "@/lib/accountAuth";
import { seedDemoWorkspace } from "@/lib/demoWorkspace";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Opens a trial workspace: a real teacher account, already activated, marked
 * `is_demo` and set to expire, seeded with the three example students. No
 * phone number and no activation code, because the point is to let someone who
 * found the site look around before asking for an account.
 *
 * The phone is a generated placeholder rather than a real number, so a trial
 * can never occupy a number someone later signs up with, and the password is
 * random and discarded — the visitor is carried by the session cookie alone.
 */

const trialDays = 7;
/** New trials per hour across the whole platform, so a script cannot fill the database. */
const hourlyLimit = 40;

export async function POST() {
  const supabase = getSupabaseAdmin();

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true)
    .gt("created_at", hourAgo);
  if ((count || 0) >= hourlyLimit) {
    return Response.json({ error: "体验名额暂时用完了，请过一会儿再试。" }, { status: 429 });
  }

  const suffix = randomBytes(5).toString("hex");
  const { hash, salt } = hashPassword(randomBytes(24).toString("hex"));
  const expiresAt = new Date(Date.now() + trialDays * 86400000).toISOString();
  const { data: account, error } = await supabase
    .from("accounts")
    .insert({
      role: "teacher",
      phone: `demo_${suffix}`,
      display_name: "体验账号",
      password_hash: hash,
      password_salt: salt,
      last_login_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      is_demo: true,
      demo_expires_at: expiresAt
    })
    .select("id, role, phone, display_name, teacher_id, activated_at, ai_enabled, is_demo, demo_expires_at")
    .single();
  if (error || !account) {
    console.error("Trial workspace creation failed:", error);
    return Response.json({ error: "体验开通失败，请稍后重试。" }, { status: 500 });
  }

  await supabase.from("accounts").update({ teacher_id: account.id }).eq("id", account.id);
  account.teacher_id = account.id;

  try {
    await seedDemoWorkspace(account.id);
  } catch (seedError) {
    // A workspace with nothing in it is not a demo, so undo rather than hand
    // the visitor fifteen empty pages.
    console.error("Trial seeding failed:", seedError);
    await supabase.from("accounts").delete().eq("id", account.id);
    return Response.json({ error: "体验数据准备失败，请稍后重试。" }, { status: 500 });
  }

  const session = await createAccountSession(account.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt)
  });

  return Response.json({ account });
}
