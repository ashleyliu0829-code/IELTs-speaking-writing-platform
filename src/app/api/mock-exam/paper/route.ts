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

type ReplayPart = { part: string; questions: { question: string; answer: string; correct: boolean }[] };

export async function GET(request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account) return new Response("请先登录。", { status: 401 });

  const examId = request.nextUrl.searchParams.get("examId") || "";
  const want = request.nextUrl.searchParams.get("part") || "listening";
  const audioId = request.nextUrl.searchParams.get("audio") || "";

  const admin = getSupabaseAdmin();
  const { data: exam } = await admin
    .from("mock_exams")
    .select(
      "id, teacher_id, student_account_id, is_active, completed_at, listening_path, listening_audio, reading_path, reading_name, reading_answer_path"
    )
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

  // The key is the student's to see only once they have finished the whole
  // sitting; a teacher may look whenever.
  if (want === "readingAnswer") {
    if (!exam.reading_answer_path) return new Response("这场模考还没有上传阅读答案。", { status: 404 });
    if (!isTeacher && !exam.completed_at) return new Response("点「模考完成」之后才能看答案。", { status: 403 });
    const url = await signed(exam.reading_answer_path, 60 * 60 * 3);
    if (!url) return new Response("答案暂时不可用。", { status: 500 });
    return Response.redirect(url, 302);
  }

  // The exam page renders the paper itself rather than handing it to the
  // browser's viewer, and a reader fetching a signed link on another origin
  // is a CORS problem waiting to happen. So the bytes come back from here.
  if (want === "reading" && request.nextUrl.searchParams.get("stream") === "1") {
    if (!exam.reading_path) return new Response("这场模考还没有上传阅读 PDF。", { status: 404 });
    const { data: file, error } = await admin.storage.from(mockExamBucket).download(exam.reading_path);
    if (error || !file) return new Response("PDF 暂时不可用。", { status: 500 });
    return new Response(await file.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=600"
      }
    });
  }

  if (want === "reading") {
    if (!exam.reading_path) return new Response("这场模考还没有上传阅读 PDF。", { status: 404 });
    const url = await signed(exam.reading_path, 60 * 60 * 3);
    if (!url) return new Response("PDF 暂时不可用。", { status: 500 });
    return Response.redirect(url, 302);
  }

  if (!exam.listening_path) return new Response("这场模考还没有上传听力试卷。", { status: 404 });

  // The paper as the student left it: their answers typed back in and the
  // marking shown. Keeping the answers rather than a snapshot of the page is
  // what makes this possible at all. The student may replay their own; the
  // teacher may replay anyone's in their workspace.
  const wantsReplay = request.nextUrl.searchParams.get("review") === "1";
  let replay = "";
  if (wantsReplay) {
    const { data: result } = await admin
      .from("mock_exam_results")
      .select("detail")
      .eq("exam_id", examId)
      .eq("part", "listening")
      .maybeSingle();
    const detail = (result?.detail || []) as ReplayPart[];
    if (detail.length) replay = replayScript(detail);
  }

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
  let html = (await file.text()).replace("<head>", `<head>\n<script>window.__AUDIO=${JSON.stringify(audio)};</script>`);
  if (replay) html = html.replace(/<\/body>\s*<\/html>\s*$/i, `${replay}\n</body>\n</html>`);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The audio links inside are short-lived, so the page must not be kept.
      "Cache-Control": "private, no-store"
    }
  });
}

/**
 * Types the student's answers back into the paper and lets it mark itself.
 *
 * The paper keeps progress in its own storage, per part, which a teacher's
 * browser does not have — but every answer was reported when the student
 * finished, so the page can simply be filled in again. The marking that
 * follows is the paper's own `finishAll`, not a recreation of it, so what is
 * shown here cannot disagree with what the student saw.
 */
function replayScript(parts: ReplayPart[]) {
  const data = JSON.stringify(parts).replace(/</g, "\u003c");
  return `<script>
(function () {
  var parts = ${data};
  var tries = 0;
  function fill() {
    var frames = [].slice.call(document.querySelectorAll(".stage iframe"));
    var ready = frames.length && frames.every(function (f) { return f.contentWindow && f.contentWindow.DATA; });
    if (!ready) { if (tries++ < 80) setTimeout(fill, 250); return; }

    frames.forEach(function (frame, i) {
      var w = frame.contentWindow;
      var part = parts[i];
      if (!part) return;
      part.questions.forEach(function (item) {
        var d = w.document;
        var name = 'q' + item.question;
        var text = d.querySelector('input[name="' + name + '"][type="text"], input.blank[name="' + name + '"]');
        if (text) {
          text.value = item.answer;
          text.dispatchEvent(new w.Event("input", { bubbles: true }));
          return;
        }
        var choice = d.querySelector('input[name="' + name + '"][value="' + item.answer + '"]');
        if (choice) { choice.checked = true; choice.dispatchEvent(new w.Event("change", { bubbles: true })); return; }
        var select = d.querySelector('select[name="' + name + '"]');
        if (select) { select.value = item.answer; select.dispatchEvent(new w.Event("change", { bubbles: true })); return; }
        var any = d.querySelector('[name="' + name + '"]');
        if (any) { any.value = item.answer; any.dispatchEvent(new w.Event("input", { bubbles: true })); }
      });
    });

    // Let the paper grade what is now on screen, exactly as it did before.
    setTimeout(function () { try { window.finishAll(); } catch (e) {} }, 250);

    var badge = document.createElement("div");
    badge.textContent = "学生作答回放 · 只读";
    badge.style.cssText =
      "position:fixed;left:12px;bottom:12px;z-index:9999;padding:6px 13px;border-radius:999px;" +
      "background:#26332f;color:#fff;font:13px system-ui,-apple-system,Segoe UI,Arial,sans-serif";
    document.body.appendChild(badge);
  }
  setTimeout(fill, 400);
})();
</script>`;
}
