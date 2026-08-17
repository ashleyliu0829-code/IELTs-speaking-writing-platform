import { requireTeacher } from "@/lib/auth";
import { getMonthlyUsage, getUsageLimits } from "@/lib/usage";

export async function GET() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const teacher = auth.account;

  const [limits, usage] = await Promise.all([getUsageLimits(teacher.id), getMonthlyUsage(teacher.id)]);

  const aiCalls = usage.ai_feedback.count + usage.ai_writing_review.count;
  const totalCostMicros =
    usage.asr_transcribe.costMicros +
    usage.ai_feedback.costMicros +
    usage.ai_writing_review.costMicros +
    usage.storage_upload.costMicros;

  return Response.json({
    plan: limits.plan,
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    estimatedCostCny: Number((totalCostMicros / 1_000_000).toFixed(2)),
    items: [
      {
        key: "asr",
        label: "语音转写",
        used: Math.round(usage.asr_transcribe.quantity),
        limit: limits.monthly_asr_seconds,
        unit: "seconds"
      },
      {
        key: "ai",
        label: "AI 批改",
        used: aiCalls,
        limit: limits.monthly_ai_calls,
        unit: "calls"
      },
      {
        key: "storage",
        label: "上传空间",
        used: usage.storage_upload.quantity,
        limit: limits.monthly_upload_bytes,
        unit: "bytes"
      }
    ]
  });
}
