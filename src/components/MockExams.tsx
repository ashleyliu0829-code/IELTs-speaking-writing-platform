"use client";

import { useEffect, useRef, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";
import { base64ToBytes, looksLikeListeningPaper, prepareListeningPaper } from "@/lib/listeningPaper";
import { defaultQuestionCount, readingBand } from "@/lib/readingSheet";
import { bandSteps, speakingBand, speakingCriteria, type SpeakingCriteria } from "@/lib/speakingScore";
import type { Assignment, MockExam, StudentProfile } from "@/lib/types";

/**
 * Mock exams: one sitting per student, four parts.
 *
 * The parts are deliberately unlike each other because the sitting is — the
 * speaking is a call, the writing is a homework already on the platform, the
 * listening is a self-grading paper done in the page, the reading is a PDF.
 * A sitting is created first and filled in as the pieces arrive, so every
 * part is independently optional and the student sees whatever is ready.
 */

export function MockExamsPanel({ students, assignments }: { students: StudentProfile[]; assignments: Assignment[] }) {
  const { t } = useLanguage();
  const [exams, setExams] = useState<MockExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [newStudent, setNewStudent] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState("");

  const writingAssignments = assignments.filter((item) => (item.assignment_type || "speaking") === "writing");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/teacher/mock-exams");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("无法加载模考。", "Could not load mock exams."));
      setExams(data.exams || []);
      setStatus("");
    } catch (problem) {
      setStatus(problem instanceof Error ? problem.message : tr("无法加载模考。", "Could not load mock exams."));
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!newStudent) return;
    setCreating(true);
    setStatus("");
    try {
      const response = await fetch("/api/teacher/mock-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: newStudent })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("创建失败。", "Could not create it."));
      setExams((current) => [data.exam, ...current]);
      setOpenId(data.exam.id);
      setNewStudent("");
    } catch (problem) {
      setStatus(problem instanceof Error ? problem.message : tr("创建失败。", "Could not create it."));
    } finally {
      setCreating(false);
    }
  }

  function replace(exam: MockExam) {
    setExams((current) => current.map((item) => (item.id === exam.id ? { ...item, ...exam } : item)));
  }

  async function remove(exam: MockExam) {
    if (!window.confirm(tr(`确定删除「${exam.title}」吗？上传的试卷也会一并删除。`, `Delete “${exam.title}”? The uploaded papers go too.`))) return;
    const response = await fetch("/api/teacher/mock-exams", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examId: exam.id })
    });
    if (response.ok) setExams((current) => current.filter((item) => item.id !== exam.id));
    else setStatus(tr("删除失败。", "Could not delete it."));
  }

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>{t("模考", "Mock exams")}</h2>
          <div className="hint">
            {t(
              "一场模考四个部分：口语（会议链接）、写作（平台上的作业）、听力（上传试卷，学生在线做、自动判分）、阅读（一份 PDF + 你填的答案，学生在 1–40 答题框里作答，系统自动判分）。可以先建好再陆续补齐。",
              "Four parts to a sitting: speaking on a call, writing from a homework already here, listening as an uploaded paper the student does and the platform grades, reading as one PDF with an answer key you type in — the student fills in a numbered sheet and it marks itself. Create the sitting first and fill it in as the pieces are ready."
            )}
          </div>
        </div>
        <button className="btn secondary" type="button" onClick={() => void load()}>
          {t("刷新", "Refresh")}
        </button>
      </div>

      <div className="mock-create">
        <select value={newStudent} onChange={(event) => setNewStudent(event.target.value)}>
          <option value="">{t("选择学生…", "Pick a student…")}</option>
          {students.map((student) => (
            <option key={student.id} value={student.name}>
              {student.name}
            </option>
          ))}
        </select>
        <button className="btn" type="button" disabled={!newStudent || creating} onClick={() => void create()}>
          {creating ? t("创建中...", "Creating...") : t("新建模考", "New mock exam")}
        </button>
      </div>

      {status && <p className="error">{status}</p>}
      {loading && <p className="hint">{t("加载中...", "Loading...")}</p>}

      {!loading && !exams.length && <p className="hint">{t("还没有模考。选一个学生新建一场。", "No mock exams yet. Pick a student to create one.")}</p>}

      <div className="mock-list">
        {exams.map((exam) => (
          <MockExamCard
            key={exam.id}
            exam={exam}
            writingAssignments={writingAssignments}
            open={openId === exam.id}
            onToggle={() => setOpenId((current) => (current === exam.id ? "" : exam.id))}
            onChanged={replace}
            onRemove={() => void remove(exam)}
          />
        ))}
      </div>
    </div>
  );
}

function MockExamCard({
  exam,
  writingAssignments,
  open,
  onToggle,
  onChanged,
  onRemove
}: {
  exam: MockExam;
  writingAssignments: Assignment[];
  open: boolean;
  onToggle: () => void;
  onChanged: (exam: MockExam) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const [speakingUrl, setSpeakingUrl] = useState(exam.speaking_url || "");
  const [saving, setSaving] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const listeningPicker = useRef<HTMLInputElement | null>(null);

  const ready = [
    Boolean(exam.speaking_url),
    Boolean(exam.writing_assignment_id),
    Boolean(exam.listening_path),
    // Reading counts as ready when all three papers are up and the key is in.
    readingReady(exam)
  ];
  const readyCount = ready.filter(Boolean).length;
  const published = exam.is_active;
  const done = Boolean(exam.completed_at);

  async function patch(fields: Record<string, unknown>, label: string) {
    setSaving(label);
    setError("");
    try {
      const response = await fetch("/api/teacher/mock-exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, ...fields })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));
      onChanged(data.exam);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : tr("保存失败。", "Could not save."));
    } finally {
      setSaving("");
    }
  }

  /**
   * The listening paper never passes through the app.
   *
   * It is taken apart here and each piece goes straight to storage with a
   * signed URL, because fifty megabytes through the proxy in front of the app
   * is a request it refuses by default and times out regardless. What crosses
   * the app is two small JSON calls: one asking where to put things, one
   * saying where they went.
   */
  async function uploadListening(file: File) {
    setSaving("listening");
    setError("");
    setUploadNote("");
    setElapsed(0);
    const ticking = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    const started = Date.now();
    try {
      setStage(t("正在读取文件", "Reading the file"));
      const source = await file.text();
      if (!looksLikeListeningPaper(source)) {
        throw new Error(tr("这个 HTML 不像导出的听力试卷（找不到内嵌音频）。", "This HTML does not look like an exported listening paper."));
      }

      setStage(t("正在抽出音频", "Lifting out the audio"));
      const prepared = prepareListeningPaper(source);
      if (!prepared.parts) throw new Error(tr("这份试卷里没有找到题目部分。", "No question parts found in this paper."));

      setStage(t("正在准备上传", "Getting ready"));
      const audioIds = prepared.audio.map((track) => track.id);
      const askResponse = await fetch("/api/teacher/mock-exams/paper-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, audioIds })
      });
      const slots = await askResponse.json().catch(() => ({}));
      if (!askResponse.ok) throw new Error(slots.error || tr("无法开始上传。", "Could not start the upload."));

      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const put = async (slot: { path: string; token: string }, body: BlobPart, type: string) => {
        const url = `${base}/storage/v1/object/upload/sign/${slots.bucket}/${slot.path}?token=${encodeURIComponent(slot.token)}`;
        const response = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: new Blob([body], { type }) });
        if (!response.ok) throw new Error(tr("上传到存储失败，请重试。", "The upload to storage failed; try again."));
      };

      let done = 0;
      const total = prepared.audio.length + 1;
      const step = () => {
        done += 1;
        setStage(t(`已上传 ${done}/${total}`, `Uploaded ${done}/${total}`));
      };
      setStage(t(`已上传 0/${total}`, `Uploaded 0/${total}`));

      await Promise.all([
        put(slots.html, prepared.html, "text/html").then(step),
        ...prepared.audio.map((track) => {
          const slot = (slots.audio || []).find((item: { id: string }) => item.id === track.id);
          if (!slot) throw new Error(tr("上传地址不完整，请重试。", "The upload slots were incomplete; try again."));
          return put(slot, base64ToBytes(track.base64), "audio/mpeg").then(step);
        })
      ]);

      setStage(t("正在保存", "Saving"));
      const finishResponse = await fetch("/api/teacher/mock-exams/paper-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", examId: exam.id, fileName: file.name, audioIds })
      });
      const finished = await finishResponse.json().catch(() => ({}));
      if (!finishResponse.ok) throw new Error(finished.error || tr("保存失败。", "Could not save."));

      onChanged({ ...exam, ...finished.exam });
      const seconds = Math.round((Date.now() - started) / 1000);
      setUploadNote(
        t(
          `已处理：${prepared.parts} 个部分，抽出 ${prepared.audio.length} 段音频，页面从 ${(file.size / 1024 / 1024).toFixed(1)}MB 降到 ${(prepared.html.length / 1024 / 1024).toFixed(2)}MB，用时 ${seconds} 秒。`,
          `Done: ${prepared.parts} parts, ${prepared.audio.length} tracks lifted out, page down from ${(file.size / 1024 / 1024).toFixed(1)}MB to ${(prepared.html.length / 1024 / 1024).toFixed(2)}MB in ${seconds}s.`
        )
      );
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : tr("上传失败。", "Upload failed."));
    } finally {
      window.clearInterval(ticking);
      setSaving("");
      setElapsed(0);
      setStage("");
      if (listeningPicker.current) listeningPicker.current.value = "";
    }
  }

  return (
    <div className={`mock-card ${open ? "open" : ""}`}>
      <button className="mock-card-head" type="button" onClick={onToggle} aria-expanded={open}>
        <div>
          <strong>{exam.student_name}</strong>
          <small>{exam.title}</small>
        </div>
        <span className={`pill ${done ? "ok" : published ? "" : ""}`}>
          {done ? t("已完成模考", "Exam finished") : published ? t("已发布", "Published") : t("未发布", "Draft")}
        </span>
        <span className={`pill ${readyCount === 4 ? "ok" : "warn"}`}>{t(`${readyCount}/4 部分已就绪`, `${readyCount}/4 ready`)}</span>
        {exam.reading_result && (
          <span className="pill ok">
            {t(`阅读 ${exam.reading_result.correct}/${exam.reading_result.total}`, `Reading ${exam.reading_result.correct}/${exam.reading_result.total}`)}
          </span>
        )}
        {exam.result ? (
          <span className="pill ok">{t(`听力 ${exam.result.correct}/${exam.result.total}`, `Listening ${exam.result.correct}/${exam.result.total}`)}</span>
        ) : (
          <span className="pill">{t("听力未提交", "Listening not done")}</span>
        )}
        <span className="student-card-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mock-card-body">
          <div className="mock-part">
            <span className="student-card-label">{t("1 · 口语", "1 · Speaking")}</span>
            <div className="overview-hours-row">
              <input
                value={speakingUrl}
                placeholder={t("粘贴腾讯会议链接", "Paste the meeting link")}
                onChange={(event) => setSpeakingUrl(event.target.value)}
              />
              <button className="btn ghost" type="button" disabled={saving === "speaking"} onClick={() => void patch({ speakingUrl }, "speaking")}>
                {saving === "speaking" ? t("保存中...", "Saving...") : t("保存", "Save")}
              </button>
            </div>
            <p className="hint">{t("学生在模考页面看到的就是这个链接。", "This is the link the student sees on their exam page.")}</p>
          </div>

          <div className="mock-part">
            <span className="student-card-label">{t("2 · 写作", "2 · Writing")}</span>
            <select
              value={exam.writing_assignment_id || ""}
              onChange={(event) => void patch({ writingAssignmentId: event.target.value || null }, "writing")}
            >
              <option value="">{t("选择一份写作作业…", "Pick a writing homework…")}</option>
              {writingAssignments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <p className="hint">{t("选平台上已有的写作作业；想计时就在那份作业里开启。", "Pick a writing homework already here; turn on its timer there if you want one.")}</p>
          </div>

          <div className="mock-part">
            <span className="student-card-label">{t("3 · 听力", "3 · Listening")}</span>
            <div className="overview-hours-row">
              <button className="btn ghost" type="button" disabled={saving === "listening"} onClick={() => listeningPicker.current?.click()}>
                {saving === "listening"
                  ? `${stage || t("处理中...", "Processing...")} ${elapsed}s`
                  : exam.listening_path
                    ? t("重新上传", "Replace")
                    : t("上传听力试卷 (HTML)", "Upload paper (HTML)")}
              </button>
              {exam.listening_name && <small>{exam.listening_name}</small>}
              {exam.listening_path && (
                <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}`} target="_blank" rel="noreferrer">
                  {t("预览", "Preview")}
                </a>
              )}
            </div>
            <input ref={listeningPicker} className="student-file-input" type="file" accept=".html,.htm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadListening(file); }} />
            <p className="hint">
              {t(
                "上传导出的听力 HTML，系统会自动把音频拆出来，学生打开快很多。一份 50MB 的试卷大约需要半分钟到一分钟，期间不要关页面。学生做完点 Finish All 后，成绩自动回传。",
                "Upload the exported HTML; the audio is lifted out automatically so it opens quickly. A 50MB paper takes roughly half a minute to a minute — leave the page open. When the student presses Finish All the score comes back here."
              )}
            </p>
            {uploadNote && <p className="hint">{uploadNote}</p>}
          </div>

          <ReadingSetup exam={exam} onChanged={onChanged} />

          {done && <MockExamReview exam={exam} onChanged={onChanged} />}

          {error && <p className="error">{error}</p>}

          <div className="mock-publish">
            <div>
              <strong>{published ? t("学生已经可以看到这场模考", "Your student can see this sitting") : t("学生还看不到这场模考", "Your student cannot see this yet")}</strong>
              <span className="hint">
                {published
                  ? t("取消发布后学生立刻看不到，已交的听力成绩会保留。", "Unpublish and it disappears from their side at once; a listening score already in stays.")
                  : readyCount
                    ? t("发布后学生端会出现这场模考，准备好的部分都能点开。", "Publishing puts it on their side, with whatever parts are ready.")
                    : t("四个部分至少填一个再发布。", "Fill in at least one part before publishing.")}
              </span>
            </div>
            <button
              className={published ? "btn secondary" : "btn"}
              type="button"
              disabled={saving === "publish" || (!published && !readyCount)}
              onClick={() => void patch({ isActive: !published }, "publish")}
            >
              {saving === "publish"
                ? t("处理中...", "Working...")
                : published
                  ? t("取消发布", "Unpublish")
                  : t("发布给学生", "Publish")}
            </button>
          </div>

          <div className="student-card-actions">
            <button className="btn link" type="button" onClick={onRemove}>
              {t("删除这场模考", "Delete this sitting")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The paper is uploaded and every question has an answer. */
function readingReady(exam: MockExam) {
  if (!exam.reading_path) return false;
  const key = exam.reading_key || [];
  return key.length > 0 && key.every((answer) => Boolean((answer || "").trim()));
}

/**
 * Reading: the paper, and the answer key the platform marks against.
 *
 * One PDF holds the whole paper, as it is handed out, and the answers are
 * typed straight down 1..40. The key is written the way an answer key is
 * written — "TRUE", "20/twenty", "(the) police station" — because that is
 * what the teacher is copying from. It is stored on the sitting and never
 * sent to the student's browser.
 */
function ReadingSetup({ exam, onChanged }: { exam: MockExam; onChanged: (exam: MockExam) => void }) {
  const { t } = useLanguage();
  const [total, setTotal] = useState(() => (exam.reading_key || []).length || defaultQuestionCount);
  const [key, setKey] = useState<string[]>(() => fillKey(exam.reading_key || [], total));
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const paperPicker = useRef<HTMLInputElement | null>(null);
  const answerPicker = useRef<HTMLInputElement | null>(null);

  const filled = key.filter((answer) => (answer || "").trim()).length;

  async function patch(fields: Record<string, unknown>, label: string) {
    setSaving(label);
    setError("");
    try {
      const response = await fetch("/api/teacher/mock-exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, ...fields })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));
      onChanged(data.exam);
      setNote(t("已保存。", "Saved."));
      window.setTimeout(() => setNote(""), 2000);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : tr("保存失败。", "Could not save."));
    } finally {
      setSaving("");
    }
  }

  async function upload(kind: "reading" | "readingAnswer", file: File) {
    setSaving(kind);
    setError("");
    try {
      if (file.type !== "application/pdf") throw new Error(tr("请上传 PDF 文件。", "Please upload a PDF."));
      const body = new FormData();
      body.append("examId", exam.id);
      body.append("kind", kind);
      body.append("file", file);
      const response = await fetch("/api/teacher/mock-exams/upload", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("上传失败。", "Upload failed."));
      onChanged({ ...exam, ...data.exam });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : tr("上传失败。", "Upload failed."));
    } finally {
      setSaving("");
      if (paperPicker.current) paperPicker.current.value = "";
      if (answerPicker.current) answerPicker.current.value = "";
    }
  }

  return (
    <div className="mock-part">
      <span className="student-card-label">{t("4 · 阅读", "4 · Reading")}</span>

      <div className="overview-hours-row">
        <button className="btn ghost" type="button" disabled={saving === "reading"} onClick={() => paperPicker.current?.click()}>
          {saving === "reading" ? t("上传中...", "Uploading...") : exam.reading_path ? t("重新上传", "Replace") : t("上传阅读 PDF", "Upload the paper")}
        </button>
        {exam.reading_name && <small>{exam.reading_name}</small>}
        {exam.reading_path && (
          <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=reading`} target="_blank" rel="noreferrer">
            {t("预览", "Preview")}
          </a>
        )}
        <input
          ref={paperPicker}
          className="student-file-input"
          type="file"
          accept="application/pdf"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("reading", file); }}
        />
      </div>

      <div className="section-head compact">
        <span className="student-card-label">{t("答案", "Answer key")}</span>
        <label className="mock-count">
          <span>{t("题数", "Questions")}</span>
          <input
            type="number"
            min={1}
            max={60}
            value={total}
            onChange={(event) => {
              const next = Math.max(1, Math.min(60, Number(event.target.value) || 1));
              setTotal(next);
              setKey((current) => fillKey(current, next));
            }}
          />
        </label>
        <span className="hint">{t(`已填 ${filled}/${total}`, `${filled}/${total} filled in`)}</span>
      </div>
      <p className="hint">
        {t(
          "按题号填写答案。多个可接受答案用「/」分隔（20/twenty）；可省略的部分放进括号（(the) police station）；选两项的题，两行填同样的内容即可，顺序不限。大小写、前后空格、连字符都不影响判分。",
          "One answer per question. Separate alternatives with “/” (20/twenty); put optional words in brackets ((the) police station); for a choose-two question put the same thing on both lines and either order counts. Case, spacing and hyphens are ignored."
        )}
      </p>
      <div className="mock-key-grid">
        {Array.from({ length: total }, (_, index) => (
          <label className="mock-key-cell" key={index + 1}>
            <span>{index + 1}</span>
            <input
              value={key[index] || ""}
              onChange={(event) => setKey((current) => current.map((entry, at) => (at === index ? event.target.value : entry)))}
            />
          </label>
        ))}
      </div>
      <div className="overview-hours-row">
        <button className="btn" type="button" disabled={saving === "key"} onClick={() => void patch({ readingKey: key.slice(0, total) }, "key")}>
          {saving === "key" ? t("保存中...", "Saving...") : t("保存答案", "Save the key")}
        </button>
        {note && <small className="hint">{note}</small>}
      </div>

      <div className="overview-hours-row">
        <button className="btn ghost" type="button" disabled={saving === "readingAnswer"} onClick={() => answerPicker.current?.click()}>
          {saving === "readingAnswer" ? t("上传中...", "Uploading...") : exam.reading_answer_path ? t("重新上传答案 PDF", "Replace the key PDF") : t("上传答案 PDF（可选）", "Upload a key PDF (optional)")}
        </button>
        {exam.reading_answer_name && <small>{exam.reading_answer_name}</small>}
        {exam.reading_answer_path && (
          <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=readingAnswer`} target="_blank" rel="noreferrer">
            {t("预览", "Preview")}
          </a>
        )}
        <input
          ref={answerPicker}
          className="student-file-input"
          type="file"
          accept="application/pdf"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("readingAnswer", file); }}
        />
      </div>
      <p className="hint">
        {t(
          `学生打开试卷后开始计时 ${exam.reading_minutes || 65} 分钟，到点自动提交。答案 PDF 在学生点「模考完成」之后解锁。`,
          `The clock starts at ${exam.reading_minutes || 65} minutes when the student opens the paper, and hands in by itself at zero. The key PDF unlocks once they press Finish the exam.`
        )}
      </p>
      {exam.reading_started_at && (
        <p className="hint">{t(`学生已于 ${formatWhen(exam.reading_started_at)} 开始阅读。`, `Started reading at ${formatWhen(exam.reading_started_at)}.`)}</p>
      )}
      {/* A key that was wrong when the sheet came in can be corrected and the
          sheet marked again — the student cannot hand in twice. */}
      {exam.reading_result && (
        <div className="overview-hours-row">
          <button className="btn ghost" type="button" disabled={saving === "remark"} onClick={() => void patch({ remarkReading: true }, "remark")}>
            {saving === "remark" ? t("重判中...", "Marking...") : t("按当前答案重新判分", "Mark again with this key")}
          </button>
          <small className="hint">
            {t(`当前成绩 ${exam.reading_result.correct}/${exam.reading_result.total}`, `Currently ${exam.reading_result.correct}/${exam.reading_result.total}`)}
          </small>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * The speaking score: four criteria the teacher gives, and the band they come
 * to.
 *
 * The overall band is worked out rather than typed — the mean of the four
 * rounded to the nearest half, which is the examiner's own arithmetic. It is
 * held back until the teacher publishes it, so a score noted during the call
 * is theirs until they say otherwise.
 */
function SpeakingScoreCard({ exam, onChanged }: { exam: MockExam; onChanged: (exam: MockExam) => void }) {
  const { t } = useLanguage();
  const score = exam.speaking_score;
  const [criteria, setCriteria] = useState<SpeakingCriteria>(() => ({ ...(score?.criteria || {}) }));
  const [comment, setComment] = useState(score?.comment || "");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const band = speakingBand(criteria);
  const published = Boolean(score?.published_at);

  async function send(fields: Record<string, unknown>, label: string) {
    setSaving(label);
    setError("");
    try {
      const response = await fetch("/api/teacher/mock-exams/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, part: "speaking", criteria, comment, ...fields })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));
      onChanged({ ...exam, speaking_score: data.score });
      setNote(t("已保存。", "Saved."));
      window.setTimeout(() => setNote(""), 2000);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : tr("保存失败。", "Could not save."));
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="mock-review-part">
      <span className="student-card-label">{t("口语", "Speaking")}</span>
      <div className="speaking-grid">
        {speakingCriteria.map((item) => (
          <label className="speaking-cell" key={item.key}>
            <span>{t(item.zh, item.en)}</span>
            <select
              value={criteria[item.key] === undefined ? "" : String(criteria[item.key])}
              onChange={(event) =>
                setCriteria((current) => {
                  const next = { ...current };
                  if (event.target.value === "") delete next[item.key];
                  else next[item.key] = Number(event.target.value);
                  return next;
                })
              }
            >
              <option value="">{t("未打分", "—")}</option>
              {bandSteps.map((value) => (
                <option key={value} value={value}>
                  {value.toFixed(1)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="overview-hours-row">
        <span className="hint">{t("总分（四项平均，自动计算）", "Overall, the mean of the four")}</span>
        <strong className="mock-result-score">{band === null ? t("四项打完才有总分", "—") : band.toFixed(1)}</strong>
        <span className={`pill ${published ? "ok" : "warn"}`}>{published ? t("已发布给学生", "Published") : t("未发布", "Not published")}</span>
      </div>

      <textarea
        className="speaking-comment"
        rows={3}
        placeholder={t("口语评语（可选，学生发布后可见）", "Comment (optional, shown once published)")}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />

      <div className="overview-hours-row">
        <button className="btn ghost" type="button" disabled={Boolean(saving)} onClick={() => void send({}, "save")}>
          {saving === "save" ? t("保存中...", "Saving...") : t("保存", "Save")}
        </button>
        <button
          className="btn"
          type="button"
          disabled={Boolean(saving) || (!published && band === null)}
          onClick={() => void send({ published: !published }, "publish")}
        >
          {saving === "publish"
            ? t("处理中...", "Working...")
            : published
              ? t("取消发布", "Unpublish")
              : t("发布给学生", "Publish to the student")}
        </button>
        {note && <small className="hint">{note}</small>}
      </div>
      {!published && band === null && <p className="hint">{t("四项都打分之后才能发布。", "All four criteria have to be given before it can be published.")}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * Changing a mark the platform made.
 *
 * The student has already seen this score, so the change lands at once and is
 * recorded as an adjustment — a teacher who gives a mark back should be able
 * to see later that they did.
 */
function ScoreAdjuster({
  exam,
  part,
  result,
  onChanged
}: {
  exam: MockExam;
  part: "reading" | "listening";
  result: { correct: number; total: number; adjusted_at?: string | null };
  onChanged: (exam: MockExam) => void;
}) {
  const { t } = useLanguage();
  const [correct, setCorrect] = useState(String(result.correct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const changed = Number(correct) !== result.correct;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/teacher/mock-exams/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, part, correct: Number(correct) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));
      onChanged(part === "reading" ? { ...exam, reading_result: data.result } : { ...exam, result: data.result });
      setNote(t("已更新，学生那边同步。", "Updated; the student sees it now."));
      window.setTimeout(() => setNote(""), 2500);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : tr("保存失败。", "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overview-hours-row">
      <label className="mock-count">
        <span>{t("修改正确题数", "Correct answers")}</span>
        <input type="number" min={0} max={result.total} value={correct} onChange={(event) => setCorrect(event.target.value)} />
      </label>
      <small className="hint">/ {result.total}</small>
      <button className="btn ghost" type="button" disabled={saving || !changed} onClick={() => void save()}>
        {saving ? t("保存中...", "Saving...") : t("保存分数", "Save the score")}
      </button>
      {result.adjusted_at && <small className="hint">{t(`老师于 ${formatWhen(result.adjusted_at)} 调整过`, `Adjusted ${formatWhen(result.adjusted_at)}`)}</small>}
      {note && <small className="hint">{note}</small>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

/** The key is held as one entry per question, blanks included. */
function fillKey(key: string[], total: number) {
  return Array.from({ length: total }, (_, index) => key[index] || "");
}

/**
 * What the teacher looks at once the student has finished: the essay, the
 * listening with a way back into the paper as the student left it, and the
 * answer key that went with the reading.
 */
function MockExamReview({ exam, onChanged }: { exam: MockExam; onChanged: (exam: MockExam) => void }) {
  const { t } = useLanguage();
  return (
    <div className="mock-review">
      <div className="section-head compact">
        <strong>{t("模考结果", "Exam results")}</strong>
        <span className="hint">{t(`学生于 ${formatWhen(exam.completed_at)} 交卷`, `Handed in ${formatWhen(exam.completed_at)}`)}</span>
      </div>

      <SpeakingScoreCard exam={exam} onChanged={onChanged} />

      <div className="mock-review-part">
        <span className="student-card-label">{t("写作", "Writing")}</span>
        {exam.writing ? (
          <>
            <div className="overview-hours-row">
              <span className={`pill ${exam.writing.marked ? "ok" : "warn"}`}>
                {exam.writing.marked ? t(`已批改 ${exam.writing.score ?? ""}`, `Marked ${exam.writing.score ?? ""}`) : t("已提交，待批改", "Submitted, to mark")}
              </span>
              {exam.writing_assignment_id && (
                <a className="btn ghost" href={`/s/${exam.writing_assignment_id}?submissionId=${exam.writing.submission_id}`} target="_blank" rel="noreferrer">
                  {t("打开作文", "Open the essay")}
                </a>
              )}
            </div>
            {(exam.writing.responses || []).map((response) => (
              <div className="mock-essay" key={response.task_label}>
                <strong>{response.task_label}</strong>
                <p>{response.response_text}</p>
              </div>
            ))}
          </>
        ) : (
          <em>{t("学生还没有提交这篇作文。", "No essay handed in for this.")}</em>
        )}
      </div>

      <div className="mock-review-part">
        <span className="student-card-label">{t("听力", "Listening")}</span>
        {exam.result ? (
          <>
            <div className="overview-hours-row">
              <span className="mock-result-score">
                {exam.result.correct}/{exam.result.total}
              </span>
              <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&review=1`} target="_blank" rel="noreferrer">
                {t("查看学生作答的试卷", "Open the paper as they left it")}
              </a>
              <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}`} target="_blank" rel="noreferrer">
                {t("原题", "Blank paper")}
              </a>
            </div>
            <ScoreAdjuster exam={exam} part="listening" result={exam.result} onChanged={onChanged} />
            <MockExamResultView result={exam.result} />
          </>
        ) : (
          <em>{t("学生没有提交听力成绩。", "No listening score was handed in.")}</em>
        )}
      </div>

      <div className="mock-review-part">
        <span className="student-card-label">{t("阅读", "Reading")}</span>
        {exam.reading_result ? (
          <>
            <div className="overview-hours-row">
              <span className="mock-result-score">
                {exam.reading_result.correct}/{exam.reading_result.total}
              </span>
              {readingBand(exam.reading_result.correct, exam.reading_result.total) !== null && (
                <span className="pill">
                  {t(
                    `参考 Band ${readingBand(exam.reading_result.correct, exam.reading_result.total)}`,
                    `Band ${readingBand(exam.reading_result.correct, exam.reading_result.total)}`
                  )}
                </span>
              )}
              <span className="hint">{t(`交卷于 ${formatWhen(exam.reading_result.submitted_at)}`, `Handed in ${formatWhen(exam.reading_result.submitted_at)}`)}</span>
              {exam.reading_path && (
                <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=reading`} target="_blank" rel="noreferrer">
                  {t("原题", "The paper")}
                </a>
              )}
            </div>
            <ScoreAdjuster exam={exam} part="reading" result={exam.reading_result} onChanged={onChanged} />
            <ReadingSheetResult result={exam.reading_result} answerKey={exam.reading_key || []} />
          </>
        ) : (
          <em>{t("学生还没有提交阅读答案。", "No reading sheet handed in yet.")}</em>
        )}
        {exam.reading_answer_path && (
          <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=readingAnswer`} target="_blank" rel="noreferrer">
            {exam.reading_answer_name || t("打开答案 PDF", "Open the answer key")}
          </a>
        )}
      </div>
    </div>
  );
}

function formatWhen(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * The marked answer sheet, with the key beside it.
 *
 * The teacher is shown what the student wrote and what was wanted on the same
 * line, because the useful question after a mock is not "how many" but "what
 * did they put instead".
 */
function ReadingSheetResult({ result, answerKey }: { result: NonNullable<MockExam["reading_result"]>; answerKey: string[] }) {
  const { t } = useLanguage();
  return (
    <ol className="mock-answer-list reading">
      {(result.detail || []).map((item) => (
        <li className={item.correct ? "right" : "wrong"} key={item.question}>
          <span className="mock-answer-no">{item.question}</span>
          <span className="mock-answer-text">{item.answer || t("（未作答）", "(blank)")}</span>
          {!item.correct && answerKey[item.question - 1] && <span className="mock-answer-key">{answerKey[item.question - 1]}</span>}
          <span aria-hidden="true">{item.correct ? "✓" : "✕"}</span>
        </li>
      ))}
    </ol>
  );
}

/** The listening result: the counts, then every answer behind them. */
function MockExamResultView({ result }: { result: NonNullable<MockExam["result"]> }) {
  const { t } = useLanguage();
  return (
    <div className="mock-result">
      <div className="section-head compact">
        <span className="student-card-label">{t("听力做题情况", "Listening result")}</span>
        <strong className="mock-result-score">
          {result.correct}/{result.total}
        </strong>
      </div>
      {(result.detail || []).map((part) => (
        <div className="mock-result-part" key={part.part}>
          <div className="mock-result-part-head">
            <strong>{part.part}</strong>
            <span className="hint">
              {part.questions.filter((q) => q.correct).length}/{part.questions.length}
            </span>
          </div>
          <ol className="mock-answer-list">
            {part.questions.map((question) => (
              <li className={question.correct ? "right" : "wrong"} key={question.question}>
                <span className="mock-answer-no">{question.question}</span>
                <span className="mock-answer-text">{question.answer || t("（未作答）", "(blank)")}</span>
                <span aria-hidden="true">{question.correct ? "✓" : "✕"}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
