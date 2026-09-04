import { z } from "zod";
import { getCurrentAccount } from "@/lib/accountAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { activationCodesMatch } from "@/lib/activation";

const payloadSchema = z.object({
  code: z.string().min(1)
});

/**
 * Redeems the activation code the operator sent, for the logged-in teacher.
 *
 * The code is checked against this account's own row rather than looked up
 * across the table, so a code issued to one teacher cannot activate another
 * account even if it is passed along.
 */
export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (account?.role !== "teacher") {
    return Response.json({ error: "请先登录老师账号。" }, { status: 401 });
  }
  if (account.activated_at) {
    return Response.json({ ok: true, alreadyActive: true });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "请输入授权码。" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("accounts")
    .select("activation_code, activated_at")
    .eq("id", account.id)
    .maybeSingle<{ activation_code: string | null; activated_at: string | null }>();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row?.activation_code) {
    return Response.json({ error: "这个账号还没有分配授权码，请联系管理员。" }, { status: 409 });
  }

  if (!activationCodesMatch(parsed.data.code, row.activation_code)) {
    console.error(`Activation failed for account ${account.id}`);
    return Response.json({ error: "授权码不正确，请检查后重试。" }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("accounts")
    .update({ activated_at: new Date().toISOString() })
    .eq("id", account.id)
    .is("activated_at", null);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
  return Response.json({ ok: true });
}
