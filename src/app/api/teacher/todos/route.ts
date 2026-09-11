import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";

/**
 * The teacher's to-do list. Plain CRUD on teacher_todos; RLS keeps every
 * teacher to their own rows, so the routes never filter by teacher_id
 * themselves beyond stamping it on insert.
 */

const columns = "id, title, due_at, done, created_at";

// An empty due time clears it; the field is optional on edit so a rename
// leaves the time alone.
const dueAt = z.string().datetime({ offset: true }).nullable();

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  dueAt: dueAt.optional().default(null)
});

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(300).optional(),
  dueAt: dueAt.optional(),
  done: z.boolean().optional()
});

export async function GET() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  // Open items first, the ones with a time before the ones without, then
  // newest; done items trail in the order they were finished.
  const { data, error } = await supabase
    .from("teacher_todos")
    .select(columns)
    .order("done", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ todos: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid to-do." }, { status: 400 });

  const { data, error } = await supabase
    .from("teacher_todos")
    .insert({ teacher_id: teacher.id, title: parsed.data.title, due_at: parsed.data.dueAt })
    .select(columns)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ todo: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid to-do." }, { status: 400 });

  const { id, title, dueAt, done } = parsed.data;
  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (dueAt !== undefined) patch.due_at = dueAt;
  if (done !== undefined) patch.done = done;
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await supabase.from("teacher_todos").update(patch).eq("id", id).select(columns).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "To-do not found." }, { status: 404 });
  return Response.json({ todo: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const id = request.nextUrl.searchParams.get("id") || "";
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Invalid to-do." }, { status: 400 });

  const { error } = await supabase.from("teacher_todos").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
