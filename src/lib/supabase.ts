import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const recordingsBucket = process.env.SUPABASE_RECORDINGS_BUCKET || "speaking-recordings";
export const homeworkImagesBucket = process.env.SUPABASE_HOMEWORK_IMAGES_BUCKET || "homework-images";

/**
 * Anything that carries a tenant identity. AccountSession satisfies this
 * structurally, so callers can pass a session straight through.
 */
export type TenantPrincipal = {
  id: string;
  role: "teacher" | "student" | "assistant";
  display_name: string;
  teacher_id?: string | null;
};

const jwtTtlSeconds = 300;

/**
 * Service role client. Bypasses RLS entirely, so it is only for work that has
 * no single tenant to scope to: registration, session lookup, storage signing.
 * Anything reading or writing tenant rows must use getSupabaseForAccount.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Tenant-scoped client. Requests run as the `authenticated` Postgres role with
 * the account's identity in the JWT, so the RLS policies in
 * supabase/20260817_enable_rls.sql decide what is visible. A forgotten
 * .eq("teacher_id") no longer leaks another tenant's rows.
 */
export function getSupabaseForAccount(account: TenantPrincipal) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const token = signSupabaseJwt(account);

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });
}

/**
 * The teacher whose workspace this account belongs to. Teachers own their own
 * workspace; students and assistants inherit their teacher's.
 */
export function workspaceTeacherId(account: TenantPrincipal) {
  return account.role === "teacher" ? account.id : account.teacher_id || null;
}

function signSupabaseJwt(account: TenantPrincipal) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("Missing SUPABASE_JWT_SECRET.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    // PostgREST switches to this Postgres role, which the RLS policies target.
    role: "authenticated",
    aud: "authenticated",
    sub: account.id,
    iat: issuedAt,
    exp: issuedAt + jwtTtlSeconds,
    // Custom claims the policies read via auth.jwt().
    account_id: account.id,
    account_role: account.role,
    teacher_id: workspaceTeacherId(account),
    // Several tables key student rows by display name rather than account id.
    display_name: account.display_name
  };

  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}
