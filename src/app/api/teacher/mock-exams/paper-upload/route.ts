import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, mockExamBucket } from "@/lib/supabase";

/**
 * Lets the teacher's browser put a paper into storage directly.
 *
 * A listening export is about fifty megabytes. Sending that to the app so the
 * app can send it on to storage means the whole thing crosses the proxy in
 * front of the app — which refuses large bodies by default and times the
 * request out long before a home upstream has finished. So the browser takes
 * the paper apart itself and asks here for somewhere to put each piece.
 *
 * The paths are built here, never taken from the request: a signed upload URL
 * is a write token, and the only ones handed out are inside this sitting's
 * own folder.
 */

const askSchema = z.object({
  examId: z.string().uuid(),
  audioIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,20}$/)).max(12)
});

const finishSchema = z.object({
  examId: z.string().uuid(),
  fileName: z.string().max(200).default(""),
  audioIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,20}$/)).max(12)
});

export async function POST(request: Request) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const body = await request.json().catch(() => ({}));

  // Step two: the browser has uploaded; record where everything landed.
  if (body?.action === "finish") {
    const parsed = finishSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "请求不完整。" }, { status: 400 });
    const { examId, fileName, audioIds } = parsed.data;

    const { data: exam } = await supabase.from("mock_exams").select("id, listening_audio").eq("id", examId).maybeSingle();
    if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

    const audioPaths = Object.fromEntries(audioIds.map((id) => [id, `${examId}/audio-${id}.mp3`]));
    // Audio from an older upload that the new paper has no use for.
    const stale = Object.entries((exam.listening_audio || {}) as Record<string, string>)
      .filter(([id]) => !audioPaths[id])
      .map(([, path]) => path)
      .filter(Boolean);
    if (stale.length) await getSupabaseAdmin().storage.from(mockExamBucket).remove(stale);

    const { data, error } = await supabase
      .from("mock_exams")
      .update({
        listening_name: fileName.slice(0, 200),
        listening_path: `${examId}/listening.html`,
        listening_audio: audioPaths,
        updated_at: new Date().toISOString()
      })
      .eq("id", examId)
      .select("listening_name, listening_path, listening_audio")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ exam: data });
  }

  // Step one: somewhere to put each piece.
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "请求不完整。" }, { status: 400 });
  const { examId, audioIds } = parsed.data;

  const { data: exam } = await supabase.from("mock_exams").select("id").eq("id", examId).maybeSingle();
  if (!exam) return Response.json({ error: "找不到这场模考。" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const sign = async (path: string) => {
    // Replacing a paper is ordinary, so an existing object is overwritten.
    const { data, error } = await admin.storage.from(mockExamBucket).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error(error?.message || "Could not sign the upload.");
    return { path, token: data.token };
  };

  try {
    const [html, ...audio] = await Promise.all([
      sign(`${examId}/listening.html`),
      ...audioIds.map((id) => sign(`${examId}/audio-${id}.mp3`))
    ]);
    return Response.json({
      bucket: mockExamBucket,
      html,
      audio: audioIds.map((id, index) => ({ id, ...audio[index] }))
    });
  } catch (problem) {
    console.error("mock-exams: could not sign paper uploads", problem);
    return Response.json({ error: problem instanceof Error ? problem.message : "无法开始上传。" }, { status: 500 });
  }
}
