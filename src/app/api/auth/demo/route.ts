import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createAccountSession, hashPassword, sessionCookieName } from "@/lib/accountAuth";
import { demoStudentName } from "@/lib/demoStudent";
import { seedDemoWorkspace } from "@/lib/demoWorkspace";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Opens a trial: a real but throwaway workspace, seeded with the three example
 * students, entered without a phone number or an activation code — the point
 * is to let someone who found the site look around before asking for one.
 *
 * Both trials build the same teacher workspace, since that is where the data
 * lives. A teacher trial signs the visitor in as its teacher; a student trial
 * signs them in as the example student instead, and the teacher account behind
 * it is never logged into. The phone numbers are generated placeholders, so a
 * trial can never occupy a number someone later signs up with, and the
 * passwords are random and discarded — the session cookie carries the visitor.
 */

const payloadSchema = z.object({ role: z.enum(["teacher", "student"]).default("teacher") });

const trialDays = 7;
/** New trials per hour across the whole platform, so a script cannot fill the database. */
const hourlyLimit = 40;

const accountColumns = "id, role, phone, display_name, teacher_id, activated_at, ai_enabled, is_demo, demo_expires_at";

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  const role = parsed.success ? parsed.data.role : "teacher";
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

  const expiresAt = new Date(Date.now() + trialDays * 86400000).toISOString();
  const { data: teacher, error: teacherError } = await supabase
    .from("accounts")
    .insert({ ...demoAccountFields("teacher", "体验账号"), demo_expires_at: expiresAt })
    .select(accountColumns)
    .single();
  if (teacherError || !teacher) {
    console.error("Trial workspace creation failed:", teacherError);
    return Response.json({ error: "体验开通失败，请稍后重试。" }, { status: 500 });
  }
  await supabase.from("accounts").update({ teacher_id: teacher.id }).eq("id", teacher.id);
  teacher.teacher_id = teacher.id;

  let signInAs = teacher;
  try {
    await seedDemoWorkspace(teacher.id);
    if (role === "student") signInAs = await attachDemoStudent(teacher.id, expiresAt);
  } catch (seedError) {
    // A workspace with nothing in it is not a demo, so undo rather than hand
    // the visitor fifteen empty pages.
    console.error("Trial seeding failed:", seedError);
    await supabase.from("accounts").delete().eq("id", teacher.id);
    return Response.json({ error: "体验数据准备失败，请稍后重试。" }, { status: 500 });
  }

  const session = await createAccountSession(signInAs.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt)
  });

  return Response.json({ account: signInAs });
}

function demoAccountFields(role: "teacher" | "student", displayName: string) {
  const { hash, salt } = hashPassword(randomBytes(24).toString("hex"));
  return {
    role,
    phone: `demo_${randomBytes(5).toString("hex")}`,
    display_name: displayName,
    password_hash: hash,
    password_salt: salt,
    last_login_at: new Date().toISOString(),
    activated_at: new Date().toISOString(),
    is_demo: true
  };
}

/**
 * Gives the example student an account and hands it back to sign in as.
 *
 * The seeder writes the student as a name on the teacher's roster, which is
 * all the teacher's pages need. The student's own pages find their work
 * through the account instead — the roster row by `account_id`, the lessons by
 * `student_account_id` — so both are pointed at the new account here. The
 * homework and the feedback are already matched by name and need no change.
 */
async function attachDemoStudent(teacherId: string, expiresAt: string) {
  const supabase = getSupabaseAdmin();
  const { data: student, error } = await supabase
    .from("accounts")
    .insert({ ...demoAccountFields("student", demoStudentName), teacher_id: teacherId, demo_expires_at: expiresAt })
    .select(accountColumns)
    .single();
  if (error || !student) throw error || new Error("Could not create the trial student account.");

  const { error: profileError } = await supabase
    .from("students")
    .update({ account_id: student.id, phone: student.phone })
    .eq("teacher_id", teacherId)
    .eq("name", demoStudentName);
  if (profileError) throw profileError;

  const { data: slots } = await supabase.from("lesson_slots").select("id").eq("teacher_id", teacherId);
  const slotIds = (slots || []).map((slot) => slot.id);
  if (slotIds.length) {
    const { error: bookingError } = await supabase
      .from("lesson_bookings")
      .update({ student_account_id: student.id })
      .in("slot_id", slotIds)
      .eq("student_name", demoStudentName);
    if (bookingError) throw bookingError;
  }

  return student;
}
