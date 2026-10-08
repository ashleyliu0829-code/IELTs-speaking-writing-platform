import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { looksLikeListeningPaper, prepareListeningPaper } from "@/lib/listeningPaper";
import { getSupabaseAdmin, mockExamBucket } from "@/lib/supabase";

/**
 * Takes the papers for one sitting: the listening export, or a reading PDF.
 *
 * The listening export carries its audio base64'd inside it — four parts came
 * to 52 MB — so it is taken apart here: the audio becomes plain MP3s stored
 * beside the page, and the page is rewritten to stream them. A student then
 * downloads about a megabyte to start rather than fifty.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const maxBytes = 120 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const form = await request.formData().catch(() => null);
  const examId = String(form?.get("examId") || "");
  const kind = String(form?.get("kind") || "");
  const file = form?.get("file");
  if (!form || !(file instanceof File) || !z.string().uuid().safeParse(examId).success || !["listening", "reading", "readingAnswer"].includes(kind)) {
    return Response.json({ error: "请求不完整。" }, { status: 400 });
  }
  if (!file.size) return Response.json({ error: "这个文件是空的。" }, { status: 400 });
  if (file.size > maxBytes) return Response.json({ error: "文件不能超过 120 MB。" }, { status: 413 });

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

    const source = await file.text();
    if (!looksLikeListeningPaper(source)) {
      return Response.json({ error: "这个 HTML 不像导出的听力试卷（找不到内嵌音频）。" }, { status: 400 });
    }

    const prepared = prepareListeningPaper(source);
    if (!prepared.parts) return Response.json({ error: "这份试卷里没有找到题目部分。" }, { status: 400 });

    // Whatever was there before is replaced, including audio from an older
    // upload that the new paper has no use for.
    const stale = Object.values((exam.listening_audio || {}) as Record<string, string>).filter(Boolean);
    if (stale.length) await admin.storage.from(mockExamBucket).remove(stale);

    const audioPaths: Record<string, string> = {};
    for (const track of prepared.audio) {
      const path = `${examId}/audio-${track.id}.mp3`;
      await store(path, track.mp3, "audio/mpeg");
      audioPaths[track.id] = path;
    }
    const htmlPath = `${examId}/listening.html`;
    await store(htmlPath, Buffer.from(prepared.html, "utf8"), "text/html");

    const { data, error } = await supabase
      .from("mock_exams")
      .update({
        listening_name: file.name.slice(0, 200),
        listening_path: htmlPath,
        listening_audio: audioPaths,
        updated_at: new Date().toISOString()
      })
      .eq("id", examId)
      .select("listening_name, listening_path, listening_audio")
      .single();
    if (error) throw new Error(error.message);

    return Response.json({
      exam: data,
      summary: {
        parts: prepared.parts,
        audio: prepared.audio.length,
        originalMb: Number((file.size / 1024 / 1024).toFixed(1)),
        pageMb: Number((prepared.html.length / 1024 / 1024).toFixed(2))
      }
    });
  } catch (problem) {
    console.error("mock-exams: upload failed", problem);
    return Response.json({ error: problem instanceof Error ? problem.message : "上传失败。" }, { status: 500 });
  }
}
