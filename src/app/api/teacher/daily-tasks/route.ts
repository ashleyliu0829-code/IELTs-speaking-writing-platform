import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import type { DailyTask } from "@/lib/types";

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  taskType: z.string().optional().default("general"),
  assignedStudents: z.array(z.string()).default([]),
  startDate: z.string().min(1),
  endDate: z.string().min(1)
});

export async function GET() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;

  const { data, error } = await auth.supabase
    .from("daily_tasks")
    .select("*, checkins:daily_task_checkins(*)")
    .order("start_date", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tasks: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const payload = taskSchema.parse(await request.json());
  const assignedStudents = uniqueNames(payload.assignedStudents);
  if (!assignedStudents.length) {
    return Response.json({ error: "Please choose at least one student." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_tasks")
    .insert({
      title: payload.title.trim(),
      description: payload.description.trim(),
      task_type: payload.taskType.trim() || "general",
      assigned_students: assignedStudents,
      teacher_id: teacher.id,
      start_date: payload.startDate,
      end_date: payload.endDate,
      is_active: true
    })
    .select("*, checkins:daily_task_checkins(*)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ task: data as DailyTask });
}

const updateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  taskType: z.string().optional(),
  assignedStudents: z.array(z.string()).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  isActive: z.boolean().optional()
});

/**
 * Edits a task in place.
 *
 * Until now the only way to fix a title or push an end date back was to
 * delete the task and set it up again — and the check-ins cascade with it, so
 * extending a task by a week cost the student their streak.
 *
 * Check-ins are never touched here. Shortening the range or dropping a student
 * hides the task from them but leaves what they already did on record, which
 * is the point of keeping the row rather than replacing it.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const payload = updateSchema.parse(await request.json());

  // RLS scopes this to the caller's workspace, so a miss means "not yours".
  const { data: current, error: readError } = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("id", payload.taskId)
    .maybeSingle<DailyTask>();

  if (readError) return Response.json({ error: readError.message }, { status: 500 });
  if (!current) return Response.json({ error: "没有找到这个每日任务。" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (payload.title !== undefined) patch.title = payload.title.trim();
  if (payload.description !== undefined) patch.description = payload.description.trim();
  if (payload.taskType !== undefined) patch.task_type = payload.taskType.trim() || "general";
  if (payload.isActive !== undefined) patch.is_active = payload.isActive;
  if (payload.startDate !== undefined) patch.start_date = payload.startDate;
  if (payload.endDate !== undefined) patch.end_date = payload.endDate;

  if (payload.assignedStudents !== undefined) {
    const assignedStudents = uniqueNames(payload.assignedStudents);
    if (!assignedStudents.length) {
      return Response.json({ error: "Please choose at least one student." }, { status: 400 });
    }
    patch.assigned_students = assignedStudents;
  }

  // Checked against the merged result, since either date may be the one that
  // did not change. Dates are stored as YYYY-MM-DD, so comparing them as text
  // orders them correctly.
  const startDate = (patch.start_date as string) ?? current.start_date;
  const endDate = (patch.end_date as string) ?? current.end_date;
  if (endDate < startDate) {
    return Response.json({ error: "结束日期不能早于开始日期。" }, { status: 400 });
  }

  if (!Object.keys(patch).length) return Response.json({ task: current });

  const { data, error } = await supabase
    .from("daily_tasks")
    .update(patch)
    .eq("id", payload.taskId)
    .select("*, checkins:daily_task_checkins(*)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ task: data as DailyTask });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) return Response.json({ error: "Missing taskId." }, { status: 400 });

  const { error } = await auth.supabase.from("daily_tasks").delete().eq("id", taskId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

function uniqueNames(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
