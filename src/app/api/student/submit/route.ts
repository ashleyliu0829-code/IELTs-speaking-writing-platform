import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";

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
  const studentName = String(formData.get("studentName") || "").trim();
  const items = itemSchema.parse(JSON.parse(String(formData.get("items") || "[]")));

  if (!assignmentId || !studentName) {
    return Response.json({ error: "Missing assignment or student name." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, assigned_students")
    .eq("id", assignmentId)
    .eq("is_active", true)
    .single();
  if (!assignment) {
    return Response.json({ error: "Assignment not found." }, { status: 404 });
  }
  if (!canStudentSubmit(studentName, assignment.assigned_students || [])) {
    return Response.json({ error: "This homework is not assigned to this student name." }, { status: 403 });
  }

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .insert({ assignment_id: assignmentId, student_name: studentName, submission_title: assignment.title })
    .select("id")
    .single();

  if (submissionError || !submission) {
    return Response.json({ error: submissionError?.message || "Could not create submission." }, { status: 500 });
  }

  const failures: Array<{ label: string; error: string }> = [];

  for (const item of items) {
    const audio = formData.get(`audio_${item.key}`);
    if (!(audio instanceof File)) {
      return Response.json({ error: `Missing recording for ${item.label}.` }, { status: 400 });
    }

    const duration = Number(formData.get(`duration_${item.key}`) || 0);
    const path = `${assignmentId}/${submission.id}/${item.key}.${audioExtension(audio.type)}`;
    const buffer = Buffer.from(await audio.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(recordingsBucket).upload(path, buffer, {
      contentType: audio.type || "audio/webm",
      upsert: true
    });

    if (uploadError) {
      failures.push({ label: item.label, error: uploadError.message });
      continue;
    }

    const { error: recordingError } = await supabase.from("recordings").insert({
      submission_id: submission.id,
      question_key: item.key,
      question_label: item.label,
      question_text: item.question,
      transcript_text: "",
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
