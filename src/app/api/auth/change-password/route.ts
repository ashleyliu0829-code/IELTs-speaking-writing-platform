import { z } from "zod";
import { getCurrentAccount, hashPassword, verifyPassword } from "@/lib/accountAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * A signed-in account changes its own password. The current password is
 * required so a borrowed session cannot lock the owner out; the session
 * itself is kept, so the person is not thrown out mid-change.
 */

const payloadSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(200)
});

export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "新密码至少需要 6 位。" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: row, error: lookupError } = await supabase
    .from("accounts")
    .select("password_hash, password_salt")
    .eq("id", account.id)
    .single();
  if (lookupError || !row) return Response.json({ error: "Account not found." }, { status: 404 });
  if (!verifyPassword(parsed.data.currentPassword, row.password_salt, row.password_hash)) {
    return Response.json({ error: "当前密码不正确。" }, { status: 400 });
  }

  const { hash, salt } = hashPassword(parsed.data.newPassword);
  const { error } = await supabase.from("accounts").update({ password_hash: hash, password_salt: salt }).eq("id", account.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
