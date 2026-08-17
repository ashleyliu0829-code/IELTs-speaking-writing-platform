import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { scoreDetails } from "@/lib/feedback";
import { averageScore } from "@/lib/questions";

const detailSchema = z.object({
  part: z.string(),
  label: z.string(),
  question: z.string(),
  score: z.number().min(0).max(9),
  comment: z.string()
});

const payloadSchema = z.object({
  submissionId: z.string().uuid(),
  overallComment: z.string(),
  details: z.array(detailSchema)
});

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const payload = payloadSchema.parse(await request.json());
  const { data: submission } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", payload.submissionId)
    .maybeSingle();
  if (!submission) return Response.json({ error: "Submission not found." }, { status: 404 });

  const overall_score = averageScore(scoreDetails(payload.details));

  const { data, error } = await supabase
    .from("feedback")
    .upsert(
      {
        submission_id: payload.submissionId,
        overall_score,
        overall_comment: payload.overallComment,
        transcript: "",
        details: payload.details,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "submission_id" }
    )
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  await supabase.from("submissions").update({ submission_status: "reviewed" }).eq("id", payload.submissionId);
  return Response.json({ feedback: data });
}
