import { requireStudent } from "@/lib/auth";

export async function GET() {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;
  if (!account.teacher_id) {
    return Response.json({ assistants: [] });
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, display_name, phone")
    .eq("role", "assistant")
    .eq("teacher_id", account.teacher_id)
    .order("display_name", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ assistants: data || [] });
}
