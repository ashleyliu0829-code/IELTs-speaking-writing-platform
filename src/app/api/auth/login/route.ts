import { cookies } from "next/headers";
import { z } from "zod";
import { createAccountSession, normalizePhone, sessionCookieName, verifyPassword } from "@/lib/accountAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

const payloadSchema = z.object({
  role: z.enum(["teacher", "student", "assistant"]),
  phone: z.string().min(6),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const payload = payloadSchema.parse(await request.json());
  const phone = normalizePhone(payload.phone);
  const supabase = getSupabaseAdmin();

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, role, phone, display_name, teacher_id, password_hash, password_salt")
    .eq("phone", phone)
    .eq("role", payload.role)
    .maybeSingle();

  if (error || !account || !verifyPassword(payload.password, account.password_salt, account.password_hash)) {
    return Response.json({ error: "Phone number or password is incorrect." }, { status: 401 });
  }

  await supabase.from("accounts").update({ last_login_at: new Date().toISOString() }).eq("id", account.id);
  const session = await createAccountSession(account.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt)
  });

  return Response.json({
    account: {
      id: account.id,
      role: account.role,
      phone: account.phone,
      display_name: account.display_name,
      teacher_id: account.teacher_id
    }
  });
}
