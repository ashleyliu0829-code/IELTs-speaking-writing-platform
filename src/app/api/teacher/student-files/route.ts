import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, studentFilesBucket } from "@/lib/supabase";

/**
 * The documents attached to a student: the assessment written after a trial
 * lesson, a scanned plan, a photo of a page.
 *
 * The bucket is private, so nothing here hands out a lasting URL — a download
 * is a short-lived signed link minted on the click. Uploads go through the
 * admin client because the bucket is not reachable with the caller's own key,
 * which makes the ownership check explicit: the student row is read with the
 * caller's client first, so RLS decides whether they may touch it at all.
 */

export const runtime = "nodejs";

const maxBytes = 20 * 1024 * 1024;
const allowed = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const form = await request.formData().catch(() => null);
  const studentId = String(form?.get("studentId") || "");
  const file = form?.get("file");
  if (!form || !(file instanceof File) || !z.string().uuid().safeParse(studentId).success) {
    return Response.json({ error: "请求不完整。" }, { status: 400 });
  }
  if (!file.size) return Response.json({ error: "这个文件是空的。" }, { status: 400 });
  if (file.size > maxBytes) return Response.json({ error: "文件不能超过 20 MB。" }, { status: 400 });
  if (!allowed.has(file.type)) {
    return Response.json({ error: "只支持 PDF、Word、Excel、txt 和图片。" }, { status: 400 });
  }

  // RLS scopes students to the caller's workspace, so a foreign id finds nothing.
  const { data: student } = await supabase.from("students").select("id").eq("id", studentId).maybeSingle();
  if (!student) return Response.json({ error: "找不到这个学生。" }, { status: 404 });

  const admin = getSupabaseAdmin();
  // The stored name is generated: a teacher's filename can carry anything,
  // and the one shown comes from the row rather than the path.
  const storagePath = `${teacher.id}/${studentId}/${randomUUID()}`;
  const { error: uploadError } = await admin.storage
    .from(studentFilesBucket)
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

  const { data, error } = await supabase
    .from("student_files")
    .insert({
      student_id: studentId,
      teacher_id: teacher.id,
      file_name: file.name.slice(0, 200),
      storage_path: storagePath,
      size_bytes: file.size,
      content_type: file.type
    })
    .select("id, student_id, file_name, size_bytes, content_type, uploaded_at")
    .single();
  if (error) {
    await admin.storage.from(studentFilesBucket).remove([storagePath]);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ file: data });
}

/** A fresh signed link for one file, minted when the teacher clicks it. */
export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const fileId = request.nextUrl.searchParams.get("fileId") || "";
  if (!z.string().uuid().safeParse(fileId).success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const { data: row } = await supabase.from("student_files").select("storage_path, file_name").eq("id", fileId).maybeSingle();
  if (!row) return Response.json({ error: "找不到这个文件。" }, { status: 404 });

  const { data, error } = await getSupabaseAdmin()
    .storage.from(studentFilesBucket)
    .createSignedUrl(row.storage_path, 300, { download: row.file_name });
  if (error || !data?.signedUrl) return Response.json({ error: error?.message || "无法生成下载链接。" }, { status: 500 });
  return Response.json({ url: data.signedUrl });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const parsed = z.object({ fileId: z.string().uuid() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const { data: row } = await supabase.from("student_files").select("id, storage_path").eq("id", parsed.data.fileId).maybeSingle();
  if (!row) return Response.json({ error: "找不到这个文件。" }, { status: 404 });

  const { error } = await supabase.from("student_files").delete().eq("id", row.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // The row is the index; a leftover object is invisible but still costs space.
  const { error: storageError } = await getSupabaseAdmin().storage.from(studentFilesBucket).remove([row.storage_path]);
  if (storageError) console.error("student-files: orphaned object", row.storage_path, storageError.message);

  return Response.json({ removed: true });
}
