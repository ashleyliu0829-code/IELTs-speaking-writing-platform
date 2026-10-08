import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, mockExamBucket } from "@/lib/supabase";

/**
 * Takes the PDFs for one sitting: the reading paper and its answer key.
 *
 * The listening export does not come through here. At around fifty megabytes
 * it is bigger than the proxy in front of the app will accept, so the browser
 * takes it apart and sends the pieces straight to storage — see
 * mock-exams/paper-upload.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const maxBytes = 40 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const form = await request.formData().catch(() => null);
  const examId = String(form?.get("examId") || "");
  const kind = String(form?.get("kind") || "");
  const file = form?.get("file");
  const kinds = ["listening", "reading", "readingAnswer"];
  if (!form || !(file instanceof File) || !z.string().uuid().safeParse(examId).success || !kinds.includes(kind)) {
    return Response.json({ error: "请求不完整。" }, { status: 400 });
  }
  if (!file.size) return Response.json({ error: "这个文件是空的。" }, { status: 400 });
  if (file.size > maxBytes) return Response.json({ error: "PDF 不能超过 40 MB。" }, { status: 413 });

  // RLS scopes the sitting to this teacher, so a foreign id finds nothing.
  const { data: exam } = await supabase
    .from("mock_exams")
    .select("id, listening_path, listening_audio, reading_path, reading_answer_path")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const store = async (path: string, body: Buffer, contentType: string) => {
    const { error } = await admin.storage.from(mockExamBucket).upload(path, body, { contentType, upsert: true });
    if (error) throw new Error(error.message);
  };

  try {
    if (kind === "reading" || kind === "readingAnswer") {
      if (file.type !== "application/pdf") return Response.json({ error: "阅读部分请上传 PDF。" }, { status: 400 });
      const isKey = kind === "readingAnswer";
      const path = `${examId}/${isKey ? "reading-answers" : "reading"}.pdf`;
      await store(path, Buffer.from(await file.arrayBuffer()), "application/pdf");
      const patch = isKey
        ? { reading_answer_name: file.name.slice(0, 200), reading_answer_path: path }
        : { reading_name: file.name.slice(0, 200), reading_path: path };
      const { data, error } = await supabase
        .from("mock_exams")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", examId)
        .select("reading_name, reading_path, reading_answer_name, reading_answer_path")
        .single();
      if (error) throw new Error(error.message);
      return Response.json({ exam: data });
    }

    return Response.json({ error: "听力试卷由浏览器直接上传，不走这个接口。" }, { status: 400 });
  } catch (problem) {
    console.error("mock-exams: upload failed", problem);
    return Response.json({ error: problem instanceof Error ? problem.message : "上传失败。" }, { status: 500 });
  }
}
