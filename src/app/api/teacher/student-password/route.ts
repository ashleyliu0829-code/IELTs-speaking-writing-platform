import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { hashPassword } from "@/lib/accountAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * The teacher resets a student's password.
 *
 * Passwords are stored as salted hashes and cannot be read back, so "forgot
 * my password" is answered with a fresh temporary one, shown to the teacher
 * once and passed on by hand. The student's existing sessions are dropped so
 * whoever held the old password is out.
 */

const payloadSchema = z.object({ studentId: z.string().uuid() });

// Readable on a phone screen: no 0/O or 1/l/I to mistake.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function temporaryPassword() {
  return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function POST(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  // RLS scopes the students table to this teacher, so a foreign id finds nothing.
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, name, account_id")
    .eq("id", parsed.data.studentId)
    .maybeSingle();
  if (studentError) return Response.json({ error: studentError.message }, { status: 500 });
  if (!student) return Response.json({ error: "找不到这个学生。" }, { status: 404 });
  if (!student.account_id) return Response.json({ error: "这个学生还没有注册账号，没有密码可重置。" }, { status: 400 });

  // The account row is updated with the service role; the ownership check is
  // explicit so the admin client never touches another teacher's student.
  const admin = getSupabaseAdmin();
  const { data: owned } = await admin
    .from("accounts")
    .select("id")
    .eq("id", student.account_id)
    .eq("role", "student")
    .eq("teacher_id", teacher.id)
    .maybeSingle();
  if (!owned) return Response.json({ error: "这个账号不属于你的班级。" }, { status: 403 });

  const password = temporaryPassword();
  const { hash, salt } = hashPassword(password);
  const { error } = await admin.from("accounts").update({ password_hash: hash, password_salt: salt }).eq("id", student.account_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await admin.from("account_sessions").delete().eq("account_id", student.account_id);

  return Response.json({ password });
}
