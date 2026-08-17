import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import type { DailyTask } from "@/lib/types";

const checkinSchema = z.object({
  taskId: z.string().min(1),
  checkinDate: z.string().min(1)
});

export async function GET() {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const today = localDateString();
  const { data, error } = await supabase
    .from("daily_tasks")
    .select("*, checkins:daily_task_checkins(*)")
    .eq("is_active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const studentName = account.display_name;
  const tasks = ((data || []) as DailyTask[]).filter((task) => taskIsVisibleToStudent(task, studentName));
  return Response.json({ tasks, today });
}

export async function POST(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const payload = checkinSchema.parse(await request.json());
  const { data: task, error: taskError } = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("id", payload.taskId)
    .maybeSingle();
  if (taskError) return Response.json({ error: taskError.message }, { status: 500 });
  if (!task) return Response.json({ error: "没有找到这个每日任务。" }, { status: 404 });
  if (!taskIsVisibleToStudent(task as DailyTask, account.display_name)) {
    return Response.json({ error: "这个任务没有分配给你。" }, { status: 403 });
  }

  const { error } = await supabase.from("daily_task_checkins").upsert(
    {
      task_id: payload.taskId,
      student_name: account.display_name,
      checkin_date: payload.checkinDate
    },
    { onConflict: "task_id,student_name,checkin_date" }
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

function taskIsVisibleToStudent(task: DailyTask, studentName: string) {
  const assigned = (task.assigned_students || []).map((name) => name.trim().toLowerCase()).filter(Boolean);
  return assigned.includes(studentName.trim().toLowerCase());
}

function localDateString() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}
