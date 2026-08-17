import { getCurrentAccount, type AccountSession } from "@/lib/accountAuth";
import { getSupabaseForAccount } from "@/lib/supabase";

export type AuthorizedContext = {
  account: AccountSession;
  /** Tenant-scoped client. RLS constrains it to this account's workspace. */
  supabase: ReturnType<typeof getSupabaseForAccount>;
};

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

  return { account, supabase: getSupabaseForAccount(account) };
}

/** Teachers and assistants both act on the workspace; students do not. */
export async function requireStaff(): Promise<AuthorizedContext | Response> {
  const account = await getCurrentAccount();
  if (account?.role !== "teacher" && account?.role !== "assistant") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
