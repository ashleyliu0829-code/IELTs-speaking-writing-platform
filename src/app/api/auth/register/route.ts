import { cookies } from "next/headers";
import { z } from "zod";
import {
  createAccountSession,
  hashPassword,
  normalizePhone,
  sessionCookieName,
  type AccountRole
} from "@/lib/accountAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { upsertStudentProfile } from "@/lib/students";

const payloadSchema = z.object({
  role: z.enum(["teacher", "student", "assistant"]),
  phone: z.string().min(6),
  displayName: z.string().min(1),
  password: z.string().min(6),
  teacherInviteToken: z.string().optional(),
  teacherPhone: z.string().optional()
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: firstValidationMessage(parsed.error) }, { status: 400 });
  }

  const payload = parsed.data;
  const role = payload.role as AccountRole;
  const phone = normalizePhone(payload.phone);
  const displayName = payload.displayName.trim();

  const supabase = getSupabaseAdmin();
  let teacherId: string | null = null;
  if (role === "student" || role === "assistant") {
    const teacherPhone = normalizePhone(payload.teacherPhone || "");
    if (!teacherPhone) {
      return Response.json({ error: role === "assistant" ? "Please enter the main teacher's phone number." : "Please enter your teacher's phone number." }, { status: 400 });
    }
    const { data: teacher, error: teacherError } = await supabase
      .from("accounts")
      .select("id")
      .eq("role", "teacher")
      .eq("phone", teacherPhone)
      .maybeSingle();
    if (teacherError || !teacher) {
      return Response.json({ error: "Teacher account not found. Please check the teacher phone number." }, { status: 404 });
    }
    teacherId = teacher.id;
  }

  const { hash, salt } = hashPassword(payload.password);
  const { data: account, error } = await supabase
    .from("accounts")
    .insert({
      role,
      phone,
      display_name: displayName,
      teacher_id: teacherId,
      password_hash: hash,
      password_salt: salt,
      last_login_at: new Date().toISOString()
    })
    .select("id, role, phone, display_name, teacher_id")
    .single();

  if (error || !account) {
    // 23505 is a unique violation, which here can only be the phone number.
    if (error?.code === "23505") {
      return Response.json({ error: "这个手机号已经注册过了，请直接登录，或换一个号码。" }, { status: 409 });
    }
    console.error("Account creation failed:", error);
    return Response.json({ error: "注册失败，请稍后重试。" }, { status: 500 });
  }

  if (role === "teacher") {
    await supabase.from("accounts").update({ teacher_id: account.id }).eq("id", account.id);
    account.teacher_id = account.id;
  }

  if (role === "student") {
    await upsertStudentProfile(displayName, { phone, accountId: account.id, teacherId }).catch((error) =>
      console.error("Student profile save failed:", error)
    );
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

/** Zod's raw issue list is not something a teacher signing up should ever see. */
function firstValidationMessage(error: z.ZodError) {
  const field = error.issues[0]?.path[0];
  const messages: Record<string, string> = {
    phone: "请输入有效的手机号。",
    password: "密码至少需要 6 位。",
    displayName: "请输入姓名。",
    role: "请选择账号类型。"
  };
  return messages[String(field)] || "请检查填写的信息。";
}
