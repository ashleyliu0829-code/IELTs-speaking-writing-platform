"use client";

import { useEffect, useRef, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * The student's side of a mock exam: the four parts, in order, each opened
 * where it belongs — the call in a new tab, the writing as the homework it
 * already is, the listening in the page, the reading as a PDF.
 *
 * The listening paper grades itself and reports back when the student presses
 * Finish; this listens for that and hands the result to the server, so the
 * teacher sees the score without the student doing anything extra.
 */

type StudentMockExam = {
  id: string;
  title: string;
  speaking_url: string;
  writing_assignment_id: string | null;
  writing_assignment: { id: string; title: string } | null;
  listening_name: string;
  listening_path: string;
  reading_name: string;
  reading_path: string;
  scheduled_at: string | null;
  result: { correct: number; total: number; submitted_at: string } | null;
};

export function StudentMockExamsPanel() {
  const { t } = useLanguage();
  const [exams, setExams] = useState<StudentMockExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/student/mock-exams");
      const data = await response.json().catch(() => ({}));
      if (response.ok) setExams(data.exams || []);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p className="hint">{t("加载中...", "Loading...")}</p>;
  if (!exams.length) {
    return <p className="hint">{t("老师还没有给你安排模考。", "Your teacher has not set a mock exam yet.")}</p>;
  }

  return (
    <div className="mock-list">
      {exams.map((exam) => (
        <StudentExamCard
          key={exam.id}
          exam={exam}
          open={openId === exam.id}
          onToggle={() => setOpenId((current) => (current === exam.id ? "" : exam.id))}
          onResult={(result) => setExams((current) => current.map((item) => (item.id === exam.id ? { ...item, result } : item)))}
        />
      ))}
    </div>
  );
}

function StudentExamCard({
  exam,
  open,
  onToggle,
  onResult
}: {
  exam: StudentMockExam;
  open: boolean;
  onToggle: () => void;
  onResult: (result: { correct: number; total: number; submitted_at: string }) => void;
}) {
  const { t } = useLanguage();
  const [part, setPart] = useState<"listening" | "reading" | "">("");
  const [saved, setSaved] = useState("");
  const frame = useRef<HTMLIFrameElement | null>(null);

  // The paper posts its result up when the student presses Finish.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; correct?: number; total?: number; parts?: unknown[] };
      if (!data || data.type !== "graderley:listening" || !data.parts) return;
      void (async () => {
        try {
          const response = await fetch("/api/student/mock-exams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ examId: exam.id, correct: data.correct || 0, total: data.total || 0, detail: data.parts })
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok && body.result) {
            onResult(body.result);
            setSaved(tr(`成绩已提交给老师：${body.result.correct}/${body.result.total}`, `Sent to your teacher: ${body.result.correct}/${body.result.total}`));
          }
        } catch {
          setSaved(tr("成绩提交失败，请检查网络后重新点一次 Finish。", "Could not send the result; check your connection and press Finish again."));
        }
      })();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [exam.id, onResult]);

  const parts = [
    { key: "speaking", label: t("口语", "Speaking"), ready: Boolean(exam.speaking_url) },
    { key: "writing", label: t("写作", "Writing"), ready: Boolean(exam.writing_assignment_id) },
    { key: "listening", label: t("听力", "Listening"), ready: Boolean(exam.listening_path) },
    { key: "reading", label: t("阅读", "Reading"), ready: Boolean(exam.reading_path) }
  ];

  return (
    <div className={`mock-card ${open ? "open" : ""}`}>
      <button className="mock-card-head" type="button" onClick={onToggle} aria-expanded={open}>
        <div>
          <strong>{exam.title}</strong>
          <small>{parts.filter((p) => p.ready).map((p) => p.label).join(" · ") || t("老师还在准备", "Being prepared")}</small>
        </div>
        {exam.result && <span className="pill ok">{t(`听力 ${exam.result.correct}/${exam.result.total}`, `Listening ${exam.result.correct}/${exam.result.total}`)}</span>}
        <span className="student-card-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mock-card-body">
          <div className="mock-part">
            <span className="student-card-label">{t("1 · 口语", "1 · Speaking")}</span>
            {exam.speaking_url ? (
              <a className="btn" href={exam.speaking_url} target="_blank" rel="noreferrer">
                {t("进入口语会议", "Join the speaking call")}
              </a>
            ) : (
              <em>{t("老师还没有放会议链接。", "No meeting link yet.")}</em>
            )}
          </div>

          <div className="mock-part">
            <span className="student-card-label">{t("2 · 写作", "2 · Writing")}</span>
            {exam.writing_assignment_id ? (
              <a className="btn" href={`/s/${exam.writing_assignment_id}`}>
                {t("打开写作题", "Open the writing task")}
                {exam.writing_assignment?.title ? ` · ${exam.writing_assignment.title}` : ""}
              </a>
            ) : (
              <em>{t("老师还没有指定写作题。", "No writing task set yet.")}</em>
            )}
          </div>

          <div className="mock-part">
            <span className="student-card-label">{t("3 · 听力", "3 · Listening")}</span>
            {exam.listening_path ? (
              <>
                <button className="btn" type="button" onClick={() => setPart(part === "listening" ? "" : "listening")}>
                  {part === "listening" ? t("收起听力", "Close listening") : t("开始听力", "Start listening")}
                </button>
                <p className="hint">{t("四个部分都做完后点右下角 Finish All，成绩会自动交给老师。", "Do all four parts, then press Finish All; the score goes to your teacher automatically.")}</p>
                {saved && <p className="hint">{saved}</p>}
                {part === "listening" && (
                  <iframe
                    ref={frame}
                    className="mock-paper-frame"
                    title={t("听力试卷", "Listening paper")}
                    src={`/api/mock-exam/paper?examId=${exam.id}`}
                  />
                )}
              </>
            ) : (
              <em>{t("老师还没有上传听力试卷。", "No listening paper yet.")}</em>
            )}
          </div>

          <div className="mock-part">
            <span className="student-card-label">{t("4 · 阅读", "4 · Reading")}</span>
            {exam.reading_path ? (
              <>
                <div className="overview-hours-row">
                  <button className="btn" type="button" onClick={() => setPart(part === "reading" ? "" : "reading")}>
                    {part === "reading" ? t("收起阅读", "Close reading") : t("打开阅读", "Open reading")}
                  </button>
                  <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=reading`} target="_blank" rel="noreferrer">
                    {t("在新标签页打开", "Open in a new tab")}
                  </a>
                </div>
                {part === "reading" && (
                  <iframe className="mock-paper-frame" title={t("阅读试卷", "Reading paper")} src={`/api/mock-exam/paper?examId=${exam.id}&part=reading`} />
                )}
              </>
            ) : (
              <em>{t("老师还没有上传阅读 PDF。", "No reading PDF yet.")}</em>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
