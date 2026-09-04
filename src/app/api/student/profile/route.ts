import { requireStudent } from "@/lib/auth";
import { upsertStudentProfile } from "@/lib/students";

/**
 * Keeps the caller's own student profile current.
 *
 * The row is written with the service role, so the name comes from the session
 * rather than the request body. A caller-supplied name would let a student add
 * people to their teacher's roster, or overwrite a classmate's row — phone and
 * account_id included — through the (teacher_id, normalized_name) upsert.
 * Callers still send studentName; it is ignored.
 */
export async function POST() {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account } = auth;

  const student = await upsertStudentProfile(account.display_name, {
    accountId: account.id,
    phone: account.phone,
    teacherId: account.teacher_id
  });
  return Response.json({ student });
}
