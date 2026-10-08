"use client";

import { useEffect, useRef, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * The student's side of a mock exam.
 *
 * Before they finish it is the paper: the four parts, each opened where it
 * belongs — the call in a new tab, the writing as the homework it already is,
 * the listening in its own tab, the reading as a PDF. After they press
 * finish it becomes the results: the same four parts, each showing whatever
 * can be known yet. Speaking waits on the teacher, writing waits on marking,
 * listening has already marked itself, and reading is the key to check
 * against — which is why the key only unlocks at that point.
 */

type StudentMockExam = {
  id: string;
  title: string;
  speaking_url: string;
  writing_assignment_id: string | null;
  writing_assignment: { id: string; title: string } | null;
  writing: { submission_id: string; status: string; marked: boolean; score: number | null; comment: string } | null;
  listening_name: string;
  listening_path: string;
  reading_name: string;
  reading_path: string;
  reading_answer_name: string;
  reading_answer_path: string;
  scheduled_at: string | null;
  completed_at: string | null;
  result: { correct: number; total: number; detail?: ResultPart[]; submitted_at: string } | null;
};

type ResultPart = { part: string; questions: { question: string; answer: string; correct: boolean }[] };

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
          onPatch={(patch) => setExams((current) => current.map((item) => (item.id === exam.id ? { ...item, ...patch } : item)))}
        />
      ))}
    </div>
  );
}

function StudentExamCard({
  exam,
  open,
  onToggle,
  onPatch
}: {
  exam: StudentMockExam;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<StudentMockExam>) => void;
}) {
  const { t } = useLanguage();
  const [showReading, setShowReading] = useState(false);
  const [note, setNote] = useState("");
  const [finishing, setFinishing] = useState(false);
  const paperTab = useRef<Window | null>(null);
  const done = Boolean(exam.completed_at);

  // The paper posts its result up when the student presses Finish All.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; correct?: number; total?: number; parts?: ResultPart[] };
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
            onPatch({ result: { ...body.result, detail: data.parts } });
            setNote(tr(`听力成绩已提交：${body.result.correct}/${body.result.total}`, `Listening sent: ${body.result.correct}/${body.result.total}`));
          }
        } catch {
          setNote(tr("成绩提交失败，请检查网络后重新点一次 Finish All。", "Could not send the result; check your connection and press Finish All again."));
        }
      })();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [exam.id, onPatch]);

  function openListening(review = false) {
    // Reuse the tab if it is still open, so a second click does not leave two
    // copies of the same paper playing their own audio.
    if (paperTab.current && !paperTab.current.closed) {
      paperTab.current.focus();
      return;
    }
    const url = `/api/mock-exam/paper?examId=${exam.id}${review ? "&review=1" : ""}`;
    paperTab.current = window.open(url, `mock-listening-${exam.id}`);
    if (!paperTab.current) setNote(tr("浏览器拦截了新标签页，请允许弹出窗口后再试。", "Your browser blocked the new tab; allow pop-ups and try again."));
  }

  async function finish() {
    if (!window.confirm(tr("确认四个部分都完成了吗？提交后这场模考会变成答案与成绩页面。", "Finished all four parts? This turns the sitting into your results page."))) return;
    setFinishing(true);
    try {
      const response = await fetch("/api/student/mock-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, action: "complete", completed: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("提交失败。", "Could not submit."));
      onPatch({ completed_at: data.completedAt });
      setNote("");
    } catch (problem) {
      setNote(problem instanceof Error ? problem.message : tr("提交失败。", "Could not submit."));
    } finally {
      setFinishing(false);
    }
  }

  const parts = [
    { label: t("口语", "Speaking"), ready: Boolean(exam.speaking_url) },
    { label: t("写作", "Writing"), ready: Boolean(exam.writing_assignment_id) },
    { label: t("听力", "Listening"), ready: Boolean(exam.listening_path) },
    { label: t("阅读", "Reading"), ready: Boolean(exam.reading_path) }
  ];

  return (
    <div className={`mock-card ${open ? "open" : ""}`}>
      <button className="mock-card-head" type="button" onClick={onToggle} aria-expanded={open}>
        <div>
          <strong>{exam.title}</strong>
          <small>
            {done
              ? t("已交卷 · 下面是答案与成绩", "Handed in · answers and scores below")
              : parts.filter((p) => p.ready).map((p) => p.label).join(" · ") || t("老师还在准备", "Being prepared")}
          </small>
        </div>
        {done && <span className="pill ok">{t("已完成", "Done")}</span>}
        {exam.result && <span className="pill">{t(`听力 ${exam.result.correct}/${exam.result.total}`, `Listening ${exam.result.correct}/${exam.result.total}`)}</span>}
        <span className="student-card-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mock-card-body">
          {/* 1 · Speaking */}
          <div className="mock-part">
            <span className="student-card-label">{t("1 · 口语", "1 · Speaking")}</span>
            {done ? (
              <em>{t("请等待老师评分。", "Waiting for your teacher to mark it.")}</em>
            ) : exam.speaking_url ? (
              <a className="btn" href={exam.speaking_url} target="_blank" rel="noreferrer">
                {t("进入口语会议", "Join the speaking call")}
              </a>
            ) : (
              <em>{t("老师还没有放会议链接。", "No meeting link yet.")}</em>
            )}
          </div>

          {/* 2 · Writing */}
          <div className="mock-part">
            <span className="student-card-label">{t("2 · 写作", "2 · Writing")}</span>
            {!exam.writing_assignment_id ? (
              <em>{t("老师还没有指定写作题。", "No writing task set yet.")}</em>
            ) : done ? (
              <>
                {exam.writing?.marked ? (
                  <div className="mock-writing-result">
                    <div className="mock-result-part-head">
                      <strong>{t("老师已批改", "Marked")}</strong>
                      {exam.writing.score != null && <span className="mock-result-score">{exam.writing.score}</span>}
                    </div>
                    {exam.writing.comment && <p className="student-note-text">{exam.writing.comment}</p>}
                  </div>
                ) : (
                  <span className="pill ok">{t("已提交，等待批改", "Submitted, awaiting marking")}</span>
                )}
                <a className="btn secondary" href={`/s/${exam.writing_assignment_id}`}>
                  {exam.writing?.marked ? t("查看批改详情", "See the full feedback") : t("查看我写的作文", "See what I wrote")}
                </a>
              </>
            ) : (
              <a className="btn" href={`/s/${exam.writing_assignment_id}`}>
                {t("打开写作题", "Open the writing task")}
                {exam.writing_assignment?.title ? ` · ${exam.writing_assignment.title}` : ""}
              </a>
            )}
          </div>

          {/* 3 · Listening */}
          <div className="mock-part">
            <span className="student-card-label">{t("3 · 听力", "3 · Listening")}</span>
            {!exam.listening_path ? (
              <em>{t("老师还没有上传听力试卷。", "No listening paper yet.")}</em>
            ) : done ? (
              <>
                {exam.result ? (
                  <>
                    <div className="mock-result-part-head">
                      <strong>{t("听力得分", "Listening score")}</strong>
                      <span className="mock-result-score">
                        {exam.result.correct}/{exam.result.total}
                      </span>
                    </div>
                    <button className="btn secondary" type="button" onClick={() => openListening(true)}>
                      {t("查看我的作答（新标签页）", "See my answers (new tab)")}
                    </button>
                    {exam.result.detail?.length ? <AnswerBreakdown detail={exam.result.detail} /> : null}
                  </>
                ) : (
                  <em>{t("这部分没有提交成绩。", "No score was handed in for this part.")}</em>
                )}
              </>
            ) : (
              <>
                <button className="btn" type="button" onClick={() => openListening(false)}>
                  {t("开始听力（新标签页）", "Start listening (new tab)")}
                </button>
                <p className="hint">
                  {t(
                    "听力会在新标签页打开，整屏做题。四个部分都做完后点右下角 Finish All，成绩会自动交给老师。",
                    "The paper opens in its own tab so you have the whole screen. Do all four parts, then press Finish All and the score comes back here."
                  )}
                </p>
              </>
            )}
          </div>

          {/* 4 · Reading */}
          <div className="mock-part">
            <span className="student-card-label">{t("4 · 阅读", "4 · Reading")}</span>
            {done ? (
              exam.reading_answer_path ? (
                <>
                  <div className="overview-hours-row">
                    <button className="btn" type="button" onClick={() => setShowReading(!showReading)}>
                      {showReading ? t("收起答案", "Hide answers") : t("查看阅读答案", "See the reading answers")}
                    </button>
                    <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=readingAnswer`} target="_blank" rel="noreferrer">
                      {t("在新标签页打开", "Open in a new tab")}
                    </a>
                  </div>
                  {showReading && (
                    <iframe className="mock-paper-frame" title={t("阅读答案", "Reading answers")} src={`/api/mock-exam/paper?examId=${exam.id}&part=readingAnswer`} />
                  )}
                </>
              ) : (
                <em>{t("老师还没有上传阅读答案。", "Your teacher has not uploaded the answers yet.")}</em>
              )
            ) : exam.reading_path ? (
              <>
                <div className="overview-hours-row">
                  <button className="btn" type="button" onClick={() => setShowReading(!showReading)}>
                    {showReading ? t("收起阅读", "Close reading") : t("打开阅读", "Open reading")}
                  </button>
                  <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=reading`} target="_blank" rel="noreferrer">
                    {t("在新标签页打开", "Open in a new tab")}
                  </a>
                </div>
                {showReading && (
                  <iframe className="mock-paper-frame" title={t("阅读试卷", "Reading paper")} src={`/api/mock-exam/paper?examId=${exam.id}&part=reading`} />
                )}
              </>
            ) : (
              <em>{t("老师还没有上传阅读 PDF。", "No reading PDF yet.")}</em>
            )}
          </div>

          {note && <p className="hint">{note}</p>}

          {!done && (
            <div className="mock-publish">
              <div>
                <strong>{t("四个部分都完成了吗？", "Finished all four parts?")}</strong>
                <span className="hint">
                  {t(
                    "交卷后这场模考会变成答案与成绩页面：阅读答案解锁，听力可以回看作答，作文等老师批改。",
                    "Handing in turns this into your results page: the reading answers unlock, your listening answers can be reviewed, and the essay waits for marking."
                  )}
                </span>
              </div>
              <button className="btn" type="button" disabled={finishing} onClick={() => void finish()}>
                {finishing ? t("提交中...", "Submitting...") : t("模考完成", "Finish the exam")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Every listening question, the answer given, and whether it was right. */
function AnswerBreakdown({ detail }: { detail: ResultPart[] }) {
  const { t } = useLanguage();
  return (
    <div className="mock-result">
      {detail.map((part) => (
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
