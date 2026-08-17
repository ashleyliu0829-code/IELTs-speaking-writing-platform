import { getSupabaseAdmin } from "@/lib/supabase";

export function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}

export async function upsertStudentProfile(
  studentName: string,
  options: { phone?: string; accountId?: string; teacherId?: string | null } = {}
) {
  const name = studentName.trim();
  if (!name) return null;

  // The unique index is (teacher_id, normalized_name) and Postgres treats NULLs
  // as distinct, so a null teacher_id never conflicts and every call would
  // insert another duplicate. Such a row is also invisible under RLS, so there
  // is nothing to gain by writing it.
  if (!options.teacherId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .upsert(
      {
        name,
        normalized_name: normalizeStudentName(name),
        phone: options.phone,
        account_id: options.accountId,
        teacher_id: options.teacherId,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "teacher_id,normalized_name" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
