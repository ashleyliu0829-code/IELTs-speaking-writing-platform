import { getCurrentAccount, type AccountSession } from "@/lib/accountAuth";
import { getSupabaseForAccount } from "@/lib/supabase";

export type AuthorizedContext = {
  account: AccountSession;
  /** Tenant-scoped client. RLS constrains it to this account's workspace. */
  supabase: ReturnType<typeof getSupabaseForAccount>;
};

/**
 * Anyone can register a teacher account, so a new workspace is inert until the
 * operator sends the activation code generated for it. Checked in the guards
 * because every teacher-side route already goes through them — there is no
 * second path to forget.
 *
 * The 403 carries a machine-readable code so the dashboard can show the
 * activation form instead of a generic error.
 */
function activationPending(account: AccountSession) {
  if (account.role !== "teacher" || account.activated_at) return null;
  return Response.json(
    { error: "这个账号还没有激活。请向管理员索取授权码。", code: "activation_required" },
    { status: 403 }
  );
}

/**
 * Guards a teacher-only route and hands back a client that can only reach this
 * teacher's workspace. Call sites cannot accidentally query unscoped, because
 * the client is the only way to get one.
 *
 *   const auth = await requireTeacher();
 *   if (auth instanceof Response) return auth;
 *   const { account: teacher, supabase } = auth;
 */
export async function requireTeacher(): Promise<AuthorizedContext | Response> {
  const account = await getCurrentAccount();
  if (account?.role !== "teacher") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = activationPending(account);
  if (pending) return pending;

  return { account, supabase: getSupabaseForAccount(account) };
}

/** Teachers and assistants both act on the workspace; students do not. */
export async function requireStaff(): Promise<AuthorizedContext | Response> {
  const account = await getCurrentAccount();
  if (account?.role !== "teacher" && account?.role !== "assistant") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = activationPending(account);
  if (pending) return pending;

  return { account, supabase: getSupabaseForAccount(account) };
}

export async function requireStudent(): Promise<AuthorizedContext | Response> {
  const account = await getCurrentAccount();
  if (account?.role !== "student") {
    return Response.json({ error: "请先登录学生账号。" }, { status: 401 });
  }

  return { account, supabase: getSupabaseForAccount(account) };
}

export type { AccountSession };
