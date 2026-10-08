import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { isBand, speakingBand, type SpeakingCriteria } from "@/lib/speakingScore";

/**
 * The teacher's own marking on a sitting: the speaking score they give, and
 * an adjustment to a paper the platform marked.
 *
 * Speaking is kept back until they publish it. Reading and listening are
 * already on the student's screen, so a change there lands at once — which is
 * why it is recorded as an adjustment rather than quietly replacing what the
 * marking produced.
 */

const speakingSchema = z.object({
  examId: z.string().uuid(),
  part: z.literal("speaking"),
  criteria: z.record(z.string(), z.number()).default({}),
  comment: z.string().trim().max(4000).default(""),
  published: z.boolean().optional()
});

const adjustSchema = z.object({
  examId: z.string().uuid(),
  part: z.enum(["reading", "listening"]),
  correct: z.number().int().min(0).max(200)
});

export async function POST(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const payload = await request.json().catch(() => ({}));

  // RLS scopes the sitting to this teacher, so a foreign id finds nothing.
  const examId = typeof payload?.examId === "string" ? payload.examId : "";
  const { data: exam } = await supabase.from("mock_exams").select("id, teacher_id").eq("id", examId).maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  const speaking = speakingSchema.safeParse(payload);
  if (speaking.success) {
    const criteria: SpeakingCriteria = {};
    for (const [key, value] of Object.entries(speaking.data.criteria)) {
      if (!isBand(value)) return Response.json({ error: "分数要在 0–9 之间，且是整数或半分。" }, { status: 400 });
      criteria[key as keyof SpeakingCriteria] = Number(value);
    }
    const band = speakingBand(criteria);
    if (speaking.data.published && band === null) {
      return Response.json({ error: "四项都打完分才能发布。" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("mock_exam_scores")
      .upsert(
        {
          exam_id: exam.id,
          teacher_id: teacher.id,
          part: "speaking",
          criteria,
          band,
          comment: speaking.data.comment,
          // Omitted means "leave it as it is"; a card that is only being
          // edited should not publish itself.
          ...(speaking.data.published === undefined
            ? {}
            : { published_at: speaking.data.published ? new Date().toISOString() : null }),
          updated_at: new Date().toISOString()
        },
        { onConflict: "exam_id,part" }
      )
      .select("part, criteria, band, comment, published_at, updated_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ score: data });
  }

  const adjust = adjustSchema.safeParse(payload);
  if (adjust.success) {
    const { data: current } = await supabase
      .from("mock_exam_results")
      .select("id, total")
      .eq("exam_id", exam.id)
      .eq("part", adjust.data.part)
      .maybeSingle();
    if (!current) return Response.json({ error: "这个部分还没有成绩可以修改。" }, { status: 400 });
    if (adjust.data.correct > (current.total || 0)) {
      return Response.json({ error: `正确题数不能超过总题数（${current.total}）。` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("mock_exam_results")
      .update({ correct: adjust.data.correct, adjusted_at: new Date().toISOString() })
      .eq("id", current.id)
      .select("part, correct, total, detail, submitted_at, adjusted_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ result: data });
  }

  return Response.json({ error: "请求不完整。" }, { status: 400 });
}
