import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { upsertStudentProfile } from "@/lib/students";
import { checkQuota, estimateStorageCostMicros, maxAudioBytes, recordUsage } from "@/lib/usage";

const itemSchema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    question: z.string()
  })
);

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const assignmentId = String(formData.get("assignmentId") || "");
  const submissionId = String(formData.get("submissionId") || "");
  const studentName = String(formData.get("studentName") || "").trim();
  const items = itemSchema.parse(JSON.parse(String(formData.get("items") || "[]")));

  if (!assignmentId || !studentName) {
    return Response.json({ error: "Missing assignment or student name." }, { status: 400 });
  }
  if (!items.length) {
    return Response.json({ error: "Please record at least one question before submitting." }, { status: 400 });
  }

  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;
  const storage = getSupabaseAdmin();

  await upsertStudentProfile(studentName, { accountId: account.id, phone: account.phone, teacherId: account.teacher_id }).catch((error) => console.error("Student profile save failed:", error));
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, assigned_students")
    .eq("id", assignmentId)
    .eq("is_active", true)
    .maybeSingle();
  if (!assignment) {
    return Response.json({ error: "Assignment not found." }, { status: 404 });
  }
  if (!canStudentSubmit(studentName, assignment.assigned_students || [])) {
    return Response.json({ error: "This homework is not assigned to this student name." }, { status: 403 });
  }

  let submission = null as { id: string } | null;
  if (submissionId) {
    const { data: existing, error: existingError } = await supabase
      .from("submissions")
      .select("id")
      .eq("id", submissionId)
      .eq("assignment_id", assignmentId)
      .ilike("student_name", studentName)
      .maybeSingle();

    if (existingError || !existing) {
      return Response.json({ error: "Submission draft not found." }, { status: 404 });
    }
    submission = existing;
  } else {
    const { data: existing } = await supabase
      .from("submissions")
      .select("id")
      .eq("assignment_id", assignmentId)
      .ilike("student_name", studentName)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    submission = existing;
  }

  if (!submission) {
    const { data: created, error: submissionError } = await supabase
      .from("submissions")
      .insert({ assignment_id: assignmentId, student_name: studentName, submission_title: assignment.title, teacher_id: account.teacher_id })
      .select("id")
      .single();

    if (submissionError || !created) {
      return Response.json({ error: submissionError?.message || "Could not create submission." }, { status: 500 });
    }
    submission = created;
  }

  const failures: Array<{ label: string; error: string }> = [];

  for (const item of items) {
    const audio = formData.get(`audio_${item.key}`);
    if (!(audio instanceof File)) {
      return Response.json({ error: `Missing recording for ${item.label}.` }, { status: 400 });
    }

    if (audio.size > maxAudioBytes) {
      return Response.json({ error: `${item.label} 的录音不能超过 ${maxAudioBytes / 1024 / 1024} MB。` }, { status: 413 });
    }

    const quotaError = await checkQuota(account.teacher_id || null, "storage_upload", audio.size);
    if (quotaError) return Response.json({ error: quotaError }, { status: 429 });

    const duration = Number(formData.get(`duration_${item.key}`) || 0);
    const path = `${assignmentId}/${submission.id}/${item.key}.${audioExtension(audio.type)}`;
    const buffer = Buffer.from(await audio.arrayBuffer());

    const { error: uploadError } = await storage.storage.from(recordingsBucket).upload(path, buffer, {
      contentType: audio.type || "audio/webm",
      upsert: true
    });

    if (uploadError) {
      failures.push({ label: item.label, error: uploadError.message });
      continue;
    }

    await recordUsage({
      teacherId: account.teacher_id || null,
      accountId: account.id,
      eventType: "storage_upload",
      quantity: audio.size,
      unit: "bytes",
      costMicros: estimateStorageCostMicros(audio.size),
      metadata: { bucket: recordingsBucket, path }
    });

    await supabase.from("recordings").delete().eq("submission_id", submission.id).eq("question_key", item.key);

    const { error: recordingError } = await supabase.from("recordings").insert({
      submission_id: submission.id,
      question_key: item.key,
      question_label: item.label,
      question_text: item.question,
      transcript_text: "",
      corrected_transcript_text: "",
      storage_path: path,
      duration_seconds: duration
    });

    if (recordingError) {
      failures.push({ label: item.label, error: recordingError.message });
      continue;
    }
  }

  if (failures.length) {
    return Response.json(
      {
        error: `Uploaded ${items.length - failures.length}/${items.length} recordings. Failed: ${failures
          .map((failure) => failure.label)
          .join(", ")}.`,
        submissionId: submission.id,
        failures
      },
      { status: 500 }
    );
  }

  return Response.json({ submissionId: submission.id });
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }
  if (mimeType.includes("aac")) {
    return "aac";
  }
  if (mimeType.includes("mpeg")) {
    return "mp3";
  }
  return "webm";
}

function canStudentSubmit(studentName: string, assignedStudents: string[]) {
  if (!assignedStudents.length) return true;
  const normalizedStudent = normalizeStudentName(studentName);
  return assignedStudents.some((student) => normalizeStudentName(student) === normalizedStudent);
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}
