import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { scoreDetails } from "@/lib/feedback";
import { averageScore } from "@/lib/questions";
import { getSupabaseAdmin } from "@/lib/supabase";

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
  const unauthorized = requireTeacher(request);
  if (unauthorized) return unauthorized;

  const payload = payloadSchema.parse(await request.json());
  const supabase = getSupabaseAdmin();
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
  return Response.json({ feedback: data });
}
