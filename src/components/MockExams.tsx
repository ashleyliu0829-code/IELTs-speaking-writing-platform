"use client";

import { useEffect, useRef, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";
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
              "一场模考四个部分：口语（会议链接）、写作（平台上的作业）、听力（上传试卷，学生在线做、自动判分）、阅读（PDF）。可以先建好再陆续补齐。",
              "Four parts to a sitting: speaking on a call, writing from a homework already here, listening as an uploaded paper the student does and the platform grades, reading as a PDF. Create it first and fill it in as the pieces are ready."
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
  const [error, setError] = useState("");
  const listeningPicker = useRef<HTMLInputElement | null>(null);
  const readingPicker = useRef<HTMLInputElement | null>(null);

  const ready = [
    Boolean(exam.speaking_url),
    Boolean(exam.writing_assignment_id),
    Boolean(exam.listening_path),
    Boolean(exam.reading_path)
  ];
  const readyCount = ready.filter(Boolean).length;
  const published = exam.is_active;

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

  async function upload(kind: "listening" | "reading", file: File) {
    setSaving(kind);
    setError("");
    setUploadNote("");
    try {
      const body = new FormData();
      body.append("examId", exam.id);
      body.append("kind", kind);
      body.append("file", file);
      const response = await fetch("/api/teacher/mock-exams/upload", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("上传失败。", "Upload failed."));
      onChanged({ ...exam, ...data.exam });
      if (data.summary) {
        setUploadNote(
          t(
            `已处理：${data.summary.parts} 个部分，抽出 ${data.summary.audio} 段音频，页面从 ${data.summary.originalMb}MB 降到 ${data.summary.pageMb}MB。`,
            `Done: ${data.summary.parts} parts, ${data.summary.audio} audio tracks lifted out, page down from ${data.summary.originalMb}MB to ${data.summary.pageMb}MB.`
          )
        );
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : tr("上传失败。", "Upload failed."));
    } finally {
      setSaving("");
      if (listeningPicker.current) listeningPicker.current.value = "";
      if (readingPicker.current) readingPicker.current.value = "";
    }
  }

  return (
    <div className={`mock-card ${open ? "open" : ""}`}>
      <button className="mock-card-head" type="button" onClick={onToggle} aria-expanded={open}>
        <div>
          <strong>{exam.student_name}</strong>
          <small>{exam.title}</small>
        </div>
        <span className={`pill ${published ? "ok" : ""}`}>{published ? t("已发布", "Published") : t("未发布", "Draft")}</span>
        <span className={`pill ${readyCount === 4 ? "ok" : "warn"}`}>{t(`${readyCount}/4 部分已就绪`, `${readyCount}/4 ready`)}</span>
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
                {saving === "listening" ? t("处理中...", "Processing...") : exam.listening_path ? t("重新上传", "Replace") : t("上传听力试卷 (HTML)", "Upload paper (HTML)")}
              </button>
              {exam.listening_name && <small>{exam.listening_name}</small>}
              {exam.listening_path && (
                <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}`} target="_blank" rel="noreferrer">
                  {t("预览", "Preview")}
                </a>
              )}
            </div>
            <input ref={listeningPicker} className="student-file-input" type="file" accept=".html,.htm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("listening", file); }} />
            <p className="hint">{t("上传导出的听力 HTML，系统会自动把音频拆出来，学生打开快很多。学生做完点 Finish 后，成绩自动回传。", "Upload the exported HTML; the audio is lifted out automatically so it opens quickly. When the student presses Finish the score comes back here.")}</p>
            {uploadNote && <p className="hint">{uploadNote}</p>}
          </div>

          <div className="mock-part">
            <span className="student-card-label">{t("4 · 阅读", "4 · Reading")}</span>
            <div className="overview-hours-row">
              <button className="btn ghost" type="button" disabled={saving === "reading"} onClick={() => readingPicker.current?.click()}>
                {saving === "reading" ? t("上传中...", "Uploading...") : exam.reading_path ? t("重新上传", "Replace") : t("上传阅读 PDF", "Upload PDF")}
              </button>
              {exam.reading_name && <small>{exam.reading_name}</small>}
              {exam.reading_path && (
                <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=reading`} target="_blank" rel="noreferrer">
                  {t("预览", "Preview")}
                </a>
              )}
            </div>
            <input ref={readingPicker} className="student-file-input" type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("reading", file); }} />
          </div>

          {exam.result && <MockExamResultView result={exam.result} />}

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
