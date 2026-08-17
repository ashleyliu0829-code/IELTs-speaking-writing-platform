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
