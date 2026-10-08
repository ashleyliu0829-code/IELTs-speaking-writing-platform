import { NextRequest } from "next/server";
import { getCurrentAccount } from "@/lib/accountAuth";
import { getSupabaseAdmin, mockExamBucket } from "@/lib/supabase";

/**
 * Serves one sitting's papers: the listening page, its audio, or the reading
 * PDF.
 *
 * The listening page is served from here rather than straight out of storage
 * for two reasons. It needs the audio URLs written into it at the moment it
 * is opened, because signed links expire. And being same-origin with the app
 * is what lets the page talk back to the one embedding it without any
 * cross-origin arrangement.
 *
 * Who may read it is checked by hand, since the admin client is doing the
 * reading: the teacher who owns the sitting, or the student it was set for.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account) return new Response("请先登录。", { status: 401 });

  const examId = request.nextUrl.searchParams.get("examId") || "";
  const want = request.nextUrl.searchParams.get("part") || "listening";
  const audioId = request.nextUrl.searchParams.get("audio") || "";

  const admin = getSupabaseAdmin();
  const { data: exam } = await admin
    .from("mock_exams")
    .select("id, teacher_id, student_account_id, is_active, listening_path, listening_audio, reading_path, reading_name")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) return new Response("找不到这场模考。", { status: 404 });

  const isTeacher = (account.role === "teacher" || account.role === "assistant") && account.teacher_id === exam.teacher_id;
  const isStudent = account.role === "student" && account.id === exam.student_account_id && exam.is_active;
  if (!isTeacher && !isStudent) return new Response("你没有权限查看这场模考。", { status: 403 });

  const signed = async (path: string, seconds = 60 * 60) => {
    const { data } = await admin.storage.from(mockExamBucket).createSignedUrl(path, seconds);
    return data?.signedUrl || "";
  };

  if (audioId) {
    const path = (exam.listening_audio as Record<string, string>)?.[audioId];
    if (!path) return new Response("找不到这段音频。", { status: 404 });
    const url = await signed(path, 60 * 60 * 3);
    if (!url) return new Response("音频暂时不可用。", { status: 500 });
    return Response.redirect(url, 302);
  }

  if (want === "reading") {
    if (!exam.reading_path) return new Response("这场模考还没有上传阅读 PDF。", { status: 404 });
    const url = await signed(exam.reading_path, 60 * 60 * 3);
    if (!url) return new Response("PDF 暂时不可用。", { status: 500 });
    return Response.redirect(url, 302);
  }

  if (!exam.listening_path) return new Response("这场模考还没有上传听力试卷。", { status: 404 });
  const { data: file, error } = await admin.storage.from(mockExamBucket).download(exam.listening_path);
  if (error || !file) return new Response("听力试卷暂时不可用。", { status: 500 });

  // The page reads window.__AUDIO; pointing it back at this route keeps the
  // signing here rather than baking an expiring link into stored HTML.
  const audio = Object.fromEntries(
    Object.keys((exam.listening_audio as Record<string, string>) || {}).map((id) => [
      id,
      `/api/mock-exam/paper?examId=${encodeURIComponent(examId)}&audio=${encodeURIComponent(id)}`
    ])
  );
  const html = (await file.text()).replace("<head>", `<head>\n<script>window.__AUDIO=${JSON.stringify(audio)};</script>`);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The audio links inside are short-lived, so the page must not be kept.
      "Cache-Control": "private, no-store"
    }
  });
}
