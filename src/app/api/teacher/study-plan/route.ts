import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { sortPhases, studyPlanSchema } from "@/lib/studyPlan";

/**
 * The teacher sets a student's study plan: the whole list of phases at once,
 * replacing what was there. An empty list clears the plan.
 */

const payloadSchema = z.object({
  studentId: z.string().uuid(),
  phases: studyPlanSchema
});

export async function PUT(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "计划内容不完整：每个阶段都需要名称和起止日期。" }, { status: 400 });
  const phases = sortPhases(parsed.data.phases);
  if (phases.some((phase) => phase.end_date < phase.start_date)) {
    return Response.json({ error: "有阶段的结束日期早于开始日期。" }, { status: 400 });
  }

  // RLS keeps this inside the teacher's own workspace.
  const { data, error } = await supabase
    .from("students")
    .update({ study_plan: phases })
    .eq("id", parsed.data.studentId)
    .select("id, study_plan")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "找不到这个学生。" }, { status: 404 });
  return Response.json({ studentId: data.id, phases });
}
