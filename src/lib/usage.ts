import { getSupabaseAdmin } from "@/lib/supabase";

export type UsageEventType = "asr_transcribe" | "ai_feedback" | "ai_writing_review" | "storage_upload";
export type UsageUnit = "seconds" | "tokens" | "bytes" | "calls";

export type UsageLimits = {
  plan: string;
  monthly_asr_seconds: number;
  monthly_ai_calls: number;
  monthly_upload_bytes: number;
};

export type UsageTotals = Record<UsageEventType, { quantity: number; costMicros: number; count: number }>;

/** Per-file upload caps. Storage is billed by the GB, so uploads need a ceiling. */
export const maxAudioBytes = 25 * 1024 * 1024;
export const maxImageBytes = 8 * 1024 * 1024;

/**
 * Sized from real use rather than a guess. Measured over two months of one
 * teacher's classes: a student's homework holds about 6.5 minutes of audio at
 * the median and 10.5 at the 90th percentile, and the busiest month came to 177
 * minutes across 31 submissions.
 *
 * Ten students on weekly homework is roughly 40 submissions, or about 320
 * minutes a month, so 600 leaves real headroom. The first version allowed 60,
 * which the teacher this was built for would have exhausted in a week.
 */
const trialLimits: UsageLimits = {
  plan: "trial",
  monthly_asr_seconds: 600 * 60,
  monthly_ai_calls: 300,
  monthly_upload_bytes: 5 * 1024 * 1024 * 1024
};

/**
 * Rough unit costs in millionths of a CNY, used only to give the teacher and
 * the operator a running spend estimate. Update alongside vendor pricing.
 */
const unitCostMicros = {
  asrSecond: 1667, // Tencent ASR, ~0.1 CNY/minute
  openAiToken: 3, // gpt-4.1-mini blended prompt+completion
  storedByte: 0.02 // Supabase storage, monthly
};

const emptyTotals = (): UsageTotals => ({
  asr_transcribe: { quantity: 0, costMicros: 0, count: 0 },
  ai_feedback: { quantity: 0, costMicros: 0, count: 0 },
  ai_writing_review: { quantity: 0, costMicros: 0, count: 0 },
  storage_upload: { quantity: 0, costMicros: 0, count: 0 }
});

export function estimateAsrCostMicros(seconds: number) {
  return Math.round(seconds * unitCostMicros.asrSecond);
}

export function estimateOpenAiCostMicros(tokens: number) {
  return Math.round(tokens * unitCostMicros.openAiToken);
}

export function estimateStorageCostMicros(bytes: number) {
  return Math.round(bytes * unitCostMicros.storedByte);
}

/**
 * Metering must never break the operation it measures, so failures are logged
 * rather than thrown.
 */
export async function recordUsage(event: {
  teacherId: string | null;
  accountId: string | null;
  eventType: UsageEventType;
  quantity: number;
  unit: UsageUnit;
  costMicros?: number;
  metadata?: Record<string, unknown>;
}) {
  if (!event.teacherId) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("usage_events").insert({
    teacher_id: event.teacherId,
    account_id: event.accountId,
    event_type: event.eventType,
    quantity: event.quantity,
    unit: event.unit,
    cost_micros: event.costMicros ?? 0,
    metadata: event.metadata ?? {}
  });

  if (error) console.error("Usage metering failed:", error.message);
}

export async function getUsageLimits(teacherId: string): Promise<UsageLimits> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("teacher_usage_limits")
    .select("plan, monthly_asr_seconds, monthly_ai_calls, monthly_upload_bytes")
    .eq("teacher_id", teacherId)
    .maybeSingle<UsageLimits>();

  return data || trialLimits;
}

export async function getMonthlyUsage(teacherId: string): Promise<UsageTotals> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("monthly_usage_totals", { target_teacher: teacherId });

  const totals = emptyTotals();
  if (error || !data) return totals;

  for (const row of data as Array<{
    event_type: UsageEventType;
    total_quantity: number;
    total_cost_micros: number;
    event_count: number;
  }>) {
    if (!totals[row.event_type]) continue;
    totals[row.event_type] = {
      quantity: Number(row.total_quantity) || 0,
      costMicros: Number(row.total_cost_micros) || 0,
      count: Number(row.event_count) || 0
    };
  }

  return totals;
}

/**
 * Returns an error message when the teacher has spent this month's allowance,
 * or null when the call may proceed. `additional` is the amount the pending
 * call is about to consume.
 */
export async function checkQuota(
  teacherId: string | null,
  eventType: UsageEventType,
  additional = 0
): Promise<string | null> {
  if (!teacherId) return null;

  const [limits, usage] = await Promise.all([getUsageLimits(teacherId), getMonthlyUsage(teacherId)]);

  if (eventType === "asr_transcribe") {
    const used = usage.asr_transcribe.quantity;
    if (used + additional > limits.monthly_asr_seconds) {
      return `本月语音转写额度已用完（${Math.round(used / 60)} / ${Math.round(
        limits.monthly_asr_seconds / 60
      )} 分钟）。请升级套餐或等待下月重置。`;
    }
  }

  if (eventType === "ai_feedback" || eventType === "ai_writing_review") {
    const used = usage.ai_feedback.count + usage.ai_writing_review.count;
    if (used + 1 > limits.monthly_ai_calls) {
      return `本月 AI 批改额度已用完（${used} / ${limits.monthly_ai_calls} 次）。请升级套餐或等待下月重置。`;
    }
  }

  if (eventType === "storage_upload") {
    const used = usage.storage_upload.quantity;
    if (used + additional > limits.monthly_upload_bytes) {
      return `本月上传空间已用完（${formatBytes(used)} / ${formatBytes(
        limits.monthly_upload_bytes
      )}）。请升级套餐或删除部分历史录音。`;
    }
  }

  return null;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
