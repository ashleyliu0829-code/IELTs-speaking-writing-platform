import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export type AccountRole = "teacher" | "student" | "assistant";

export type AccountSession = {
  id: string;
  role: AccountRole;
  phone: string;
  display_name: string;
  teacher_id?: string | null;
  /** Null while a teacher is waiting for the operator to send their code. */
  activated_at?: string | null;
};

export const sessionCookieName = "ielts_session";
const sessionDays = 30;

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").trim();
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(hashPassword(password, salt).hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAccountSession(accountId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("account_sessions").insert({
    account_id: accountId,
    token_hash: hashSessionToken(token),
    expires_at: expiresAt
  });

  if (error) throw error;
  return { token, expiresAt };
}

export async function getCurrentAccount(): Promise<AccountSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("account_sessions")
    .select("expires_at, accounts(id, role, phone, display_name, teacher_id, activated_at)")
    .eq("token_hash", hashSessionToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  const account = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts;
  if (!account) return null;

  return {
    id: account.id,
    role: account.role,
    phone: account.phone,
    display_name: account.display_name,
    teacher_id: account.teacher_id,
    activated_at: account.activated_at
  };
}

export async function getStudentAccount(): Promise<AccountSession | null> {
  const account = await getCurrentAccount();
  return account?.role === "student" ? account : null;
}

export async function clearCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return;
  const supabase = getSupabaseAdmin();
  await supabase.from("account_sessions").delete().eq("token_hash", hashSessionToken(token));
}
