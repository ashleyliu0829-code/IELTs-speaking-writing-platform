import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { type AccountSession } from "@/lib/accountAuth";
import { p1QuestionBank, p2P3QuestionBank } from "@/lib/questionBank";
import { getSupabaseAdmin, getSupabaseForAccount, recordingsBucket } from "@/lib/supabase";
import { signRecordingUrls } from "@/lib/recordingUrls";
import { upsertStudentProfile } from "@/lib/students";
import { checkQuota, estimateStorageCostMicros, maxAudioBytes, recordUsage } from "@/lib/usage";
import type { SpeakingPracticeRecording, SpeakingPracticeSubmission } from "@/lib/types";

const createSchema = z.object({
  topicType: z.enum(["p1", "p2"]),
  topicId: z.string().min(1)
});

const itemSchema = z.object({
  key: z.string(),
  label: z.string(),
  question: z.string()
});

const submitSchema = z.object({
  practiceId: z.string().uuid()
});

/**
 * Student accounts created before the workspace migration can still have a
 * null teacher_id. Resolve it before signing a token, because every RLS policy
 * keys off the teacher_id claim and a null one matches nothing.
 */
async function studentContext() {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  if (auth.account.teacher_id) return auth;

  const teacherId = await resolveTeacherId(auth.account);
  if (!teacherId) return auth;

  const account = { ...auth.account, teacher_id: teacherId };
  return { account, supabase: getSupabaseForAccount(account) };
}

export async function GET() {
  const auth = await studentContext();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const { data, error } = await supabase
    .from("speaking_practice_submissions")
    .select("*, recordings:speaking_practice_recordings(*)")
    .eq("student_account_id", account.id)
    .order("submitted_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ practices: await attachSignedUrls((data || []) as SpeakingPracticeSubmission[]) });
}

export async function POST(request: Request) {
  const payload = createSchema.parse(await request.json());
  const auth = await studentContext();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const teacherId = account.teacher_id;
  if (!teacherId) return Response.json({ error: "该学生账号还没有绑定老师。请先让老师给这个学生发布一次作业，或用老师邀请链接重新登录/注册。" }, { status: 400 });

  const topic = getPracticeTopic(payload.topicType, payload.topicId);
  if (!topic) return Response.json({ error: "没有找到这个口语话题。" }, { status: 404 });

  await upsertStudentProfile(account.display_name, {
    accountId: account.id,
    phone: account.phone,
    teacherId
  }).catch((error) => console.error("Student profile save failed:", error));

  const practiceType = payload.topicType === "p1" ? "p1" : "p2p3";
  const row = {
    teacher_id: teacherId,
    student_account_id: account.id,
    student_name: account.display_name,
    practice_type: practiceType,
    topic_id: payload.topicId,
    topic_title: topic.topic,
    p1_questions: topic.p1Questions,
    p2_prompt: topic.p2Prompt,
    p3_questions: topic.p3Questions,
    status: "in_progress"
  };

  const { data: created, error } = await supabase
    .from("speaking_practice_submissions")
    .upsert(row, { onConflict: "teacher_id,student_account_id,practice_type,topic_id" })
    .select("*, recordings:speaking_practice_recordings(*)")
    .single<SpeakingPracticeSubmission>();

  if (error || !created) {
    return Response.json({ error: error?.message || "无法创建这个练习。" }, { status: 500 });
  }

  return Response.json({ practice: (await attachSignedUrls([created]))[0] });
}

export async function PUT(request: NextRequest) {
  const formData = await request.formData();
  const practiceId = String(formData.get("practiceId") || "");
  const item = itemSchema.parse(JSON.parse(String(formData.get("item") || "{}")));
  const audio = formData.get("audio");

  if (!practiceId) return Response.json({ error: "Missing practice." }, { status: 400 });
  if (!(audio instanceof File)) return Response.json({ error: `Missing recording for ${item.label}.` }, { status: 400 });

  if (audio.size > maxAudioBytes) {
    return Response.json({ error: `录音不能超过 ${maxAudioBytes / 1024 / 1024} MB。` }, { status: 413 });
  }

  const auth = await studentContext();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;
  const teacherId = account.teacher_id || null;
  const storage = getSupabaseAdmin();

  const quotaError = await checkQuota(teacherId, "storage_upload", audio.size);
  if (quotaError) return Response.json({ error: quotaError }, { status: 429 });

  const { data: practice, error: practiceError } = await supabase
    .from("speaking_practice_submissions")
    .select("id, teacher_id, student_account_id")
    .eq("id", practiceId)
    .eq("student_account_id", account.id)
    .maybeSingle();
  if (practiceError) return Response.json({ error: practiceError.message }, { status: 500 });
  if (!practice) return Response.json({ error: "没有找到这个练习。" }, { status: 404 });

  const duration = Number(formData.get("duration") || 0);
  const path = `practice/${practiceId}/${item.key}.${audioExtension(audio.type)}`;
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: uploadError } = await storage.storage.from(recordingsBucket).upload(path, buffer, {
    contentType: audio.type || "audio/webm",
    upsert: true
  });

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

  await recordUsage({
    teacherId,
    accountId: account.id,
    eventType: "storage_upload",
    quantity: audio.size,
    unit: "bytes",
    costMicros: estimateStorageCostMicros(audio.size),
    metadata: { bucket: recordingsBucket, path }
  });

  const { error: recordingError } = await supabase.from("speaking_practice_recordings").upsert(
    {
      practice_submission_id: practiceId,
      question_key: item.key,
      question_label: item.label,
      question_text: item.question,
      storage_path: path,
      duration_seconds: duration
    },
    { onConflict: "practice_submission_id,question_key" }
  );

  if (recordingError) return Response.json({ error: recordingError.message }, { status: 500 });

  const { data: updated } = await supabase
    .from("speaking_practice_submissions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", practiceId)
    .select("*, recordings:speaking_practice_recordings(*)")
    .single<SpeakingPracticeSubmission>();

  return Response.json({ practice: updated ? (await attachSignedUrls([updated]))[0] : null });
}

export async function PATCH(request: Request) {
  const payload = submitSchema.parse(await request.json());
  const auth = await studentContext();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const { data: practice, error: practiceError } = await supabase
    .from("speaking_practice_submissions")
    .select("*, recordings:speaking_practice_recordings(*)")
    .eq("id", payload.practiceId)
    .eq("student_account_id", account.id)
    .maybeSingle<SpeakingPracticeSubmission>();
  if (practiceError) return Response.json({ error: practiceError.message }, { status: 500 });
  if (!practice) return Response.json({ error: "没有找到这个练习。" }, { status: 404 });
  if (!practice.recordings?.length) return Response.json({ error: "请先保存至少一段录音后再提交。" }, { status: 400 });

  const { data: submitted, error } = await supabase
    .from("speaking_practice_submissions")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", payload.practiceId)
    .select("*, recordings:speaking_practice_recordings(*)")
    .single<SpeakingPracticeSubmission>();

  if (error || !submitted) return Response.json({ error: error?.message || "提交失败。" }, { status: 500 });
  return Response.json({ practice: (await attachSignedUrls([submitted]))[0] });
}

/**
 * The workspace a student belongs to.
 *
 * Only the student's own account and profile are consulted. Earlier versions
 * also guessed by display name — searching every teacher's students, and every
 * teacher's assigned_students lists, for a matching name — and then wrote the
 * first hit to accounts.teacher_id permanently. With one teacher that always
 * guessed right. With several it silently binds, say, one teacher's 李伟 to
 * another teacher's workspace, and RLS then faithfully scopes them to the wrong
 * teacher: identity is decided before the policies apply.
 *
 * Registration requires the teacher's phone number, so a student account is
 * bound at signup. An unbound account is a real problem worth surfacing, not
 * something to paper over with a guess.
 */
async function resolveTeacherId(account: AccountSession) {
  if (account.teacher_id) return account.teacher_id;

  const supabase = getSupabaseAdmin();
  const { data: studentRows } = await supabase
    .from("students")
    .select("teacher_id")
    .eq("account_id", account.id)
    .not("teacher_id", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  const profileTeacherId = studentRows?.[0]?.teacher_id as string | undefined;
  if (!profileTeacherId) return null;

  await supabase.from("accounts").update({ teacher_id: profileTeacherId }).eq("id", account.id);
  return profileTeacherId;
}

function getPracticeTopic(topicType: "p1" | "p2", topicId: string) {
  if (topicType === "p1") {
    const topic = p1QuestionBank.find((set) => set.id === topicId);
    return topic ? { topic: topic.topic, p1Questions: topic.questions, p2Prompt: "", p3Questions: [] } : null;
  }

  const topic = p2P3QuestionBank.find((set) => set.id === topicId);
  return topic ? { topic: topic.topic, p1Questions: [], p2Prompt: topic.p2Prompt, p3Questions: topic.p3Questions } : null;
}

async function attachSignedUrls(practices: SpeakingPracticeSubmission[]) {
  const supabase = getSupabaseAdmin();
  // One batch across every practice, rather than a request per recording.
  const signedUrls = await signRecordingUrls(
    supabase,
    recordingsBucket,
    practices.flatMap((practice) =>
      (practice.recordings || []).map((recording: SpeakingPracticeRecording) => recording.storage_path)
    )
  );

  return practices.map((practice) => ({
    ...practice,
    recordings: (practice.recordings || []).map((recording: SpeakingPracticeRecording) => ({
      ...recording,
      signed_url: signedUrls.get(recording.storage_path)
    }))
  }));
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}
