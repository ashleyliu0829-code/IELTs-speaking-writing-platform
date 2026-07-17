import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const payloadSchema = z.object({
  assignmentId: z.string().uuid(),
  studentName: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const payload = payloadSchema.parse(await request.json());
  const supabase = getSupabaseAdmin();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title")
    .eq("id", payload.assignmentId)
    .eq("is_active", true)
    .single();

  if (!assignment) {
    return Response.json({ error: "Assignment not found." }, { status: 404 });
  }

  const { data: submission, error } = await supabase
    .from("submissions")
    .insert({ assignment_id: payload.assignmentId, student_name: payload.studentName.trim(), submission_title: assignment.title })
    .select("id")
    .single();

  if (error || !submission) {
    return Response.json({ error: error?.message || "Could not create submission." }, { status: 500 });
  }

  return Response.json({ submissionId: submission.id });
}
