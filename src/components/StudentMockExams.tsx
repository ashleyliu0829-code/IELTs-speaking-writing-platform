"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";
import { listeningBand, overallBand, readingBand } from "@/lib/examBands";
import { speakingCriteria } from "@/lib/speakingScore";
import type { ReadingResult, ReadingTimerState, SpeakingScore } from "@/lib/types";

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
  reading_total: number;
  reading_minutes: number;
  reading_started_at: string | null;
  reading_draft: string[];
  reading_timer: ReadingTimerState | null;
  reading_result: ReadingResult | null;
  speaking_score: SpeakingScore | null;
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
  // A paper to sit and a result to read are different errands.
  const [tab, setTab] = useState<"new" | "done">("new");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/student/mock-exams");
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const list: StudentMockExam[] = data.exams || [];
        setExams(list);
        // Land on whichever one they actually have.
        if (!list.some((exam) => !exam.completed_at) && list.some((exam) => exam.completed_at)) setTab("done");
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p className="hint">{t("加载中...", "Loading...")}</p>;
  if (!exams.length) {
    return <p className="hint">{t("老师还没有给你安排模考。", "Your teacher has not set a mock exam yet.")}</p>;
  }

  const waiting = exams.filter((exam) => !exam.completed_at);
  const finished = exams.filter((exam) => exam.completed_at);
  const shown = tab === "new" ? waiting : finished;

  return (
    <div className="stack">
      <div className="mock-tabs" role="tablist">
        <button
          className={`mock-tab ${tab === "new" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "new"}
          onClick={() => setTab("new")}
        >
          {t(`新模考 (${waiting.length})`, `To sit (${waiting.length})`)}
        </button>
        <button
          className={`mock-tab ${tab === "done" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "done"}
          onClick={() => setTab("done")}
        >
          {t(`已完成模考 (${finished.length})`, `Finished (${finished.length})`)}
        </button>
      </div>

      {!shown.length && (
        <p className="hint">
          {tab === "new"
            ? t("没有待做的模考。", "Nothing to sit at the moment.")
            : t("还没有完成的模考。", "Nothing finished yet.")}
        </p>
      )}

      <div className="mock-list">
        {shown.map((exam) => (
          <StudentExamCard
            key={exam.id}
            exam={exam}
            open={openId === exam.id}
            onToggle={() => setOpenId((current) => (current === exam.id ? "" : exam.id))}
            onPatch={(patch) => setExams((current) => current.map((item) => (item.id === exam.id ? { ...item, ...patch } : item)))}
          />
        ))}
      </div>
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
        {exam.reading_result && (
          <span className="pill">{t(`阅读 ${exam.reading_result.correct}/${exam.reading_result.total}`, `Reading ${exam.reading_result.correct}/${exam.reading_result.total}`)}</span>
        )}
        <span className="student-card-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mock-card-body">
          {/* The four skills and the overall, once the sitting is over. */}
          {done && (
            <StudentOverall
              listening={exam.result ? listeningBand(exam.result.correct, exam.result.total) : null}
              reading={exam.reading_result ? readingBand(exam.reading_result.correct, exam.reading_result.total) : null}
              writing={exam.writing?.marked ? exam.writing.score : null}
              speaking={exam.speaking_score?.published_at ? exam.speaking_score.band : null}
            />
          )}

          {/* 1 · Speaking */}
          <div className="mock-part">
            <span className="student-card-label">{t("1 · 口语", "1 · Speaking")}</span>
            {done ? (
              exam.speaking_score && exam.speaking_score.published_at ? (
                <SpeakingResult score={exam.speaking_score} />
              ) : (
                <em>{t("请等待老师评分。", "Waiting for your teacher to mark it.")}</em>
              )
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

          <StudentReading exam={exam} onPatch={onPatch} done={done} />

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

/**
 * Reading: the paper, an answer sheet numbered straight through, and a
 * clock that starts when the paper is opened.
 *
 * The clock is anchored to a moment the server stored, so a reload or a
 * second tab carries on rather than starting over, and nothing the browser
 * keeps can hand time back. The sheet is saved as it is filled in, which is
 * what makes running out of time survivable: at zero it is handed in and
 * marked from what was saved, whether or not the student is still there.
 */
function StudentReading({
  exam,
  onPatch,
  done
}: {
  exam: StudentMockExam;
  onPatch: (patch: Partial<StudentMockExam>) => void;
  done: boolean;
}) {
  const { t } = useLanguage();
  // How many questions, without the answers behind them.
  const total = exam.reading_total || 0;

  const [answers, setAnswers] = useState<string[]>(() => Array.from({ length: total }, (_, i) => exam.reading_draft?.[i] || ""));
  const [startedAt, setStartedAt] = useState<string | null>(exam.reading_started_at);
  const [remaining, setRemaining] = useState(exam.reading_timer?.remainingSeconds ?? (exam.reading_minutes || 0) * 60);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [showKey, setShowKey] = useState(false);
  const answersRef = useRef(answers);
  const handedIn = useRef(false);
  answersRef.current = answers;

  const minutes = exam.reading_minutes || 0;
  const endsAt = startedAt ? new Date(startedAt).getTime() + minutes * 60 * 1000 : 0;
  const result = exam.reading_result;

  // The clock, shown but not acted on: handing in belongs to the exam page,
  // which holds the answers. A card counting down in a forgotten tab must
  // not hand in the answers it happened to load with.
  useEffect(() => {
    if (!startedAt || !minutes || result) return;
    const tick = () => setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    tick();
    const loop = window.setInterval(tick, 1000);
    return () => window.clearInterval(loop);
  }, [startedAt, minutes, endsAt, result]);


  // The sheet lives on the exam page now, and so does its saving. This card
  // must not also save: it holds whatever the answers were when it loaded,
  // and a card left open in another tab would quietly write them back over
  // an hour of work.

  function openPaper() {
    // The tab is opened on the click itself, before anything is awaited, or
    // the browser treats it as a pop-up and blocks it.
    const tab = window.open(`/exam/reading/${exam.id}`, `mock-reading-${exam.id}`);
    if (!tab) setNote(tr("浏览器拦截了新标签页，请允许弹出窗口后再试。", "Your browser blocked the new tab; allow pop-ups and try again."));
    if (!startedAt) void beginClock();
  }

  async function beginClock() {
    setBusy("start");
    try {
      const response = await fetch("/api/student/mock-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, action: "reading-start" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("计时启动失败。", "Could not start the clock."));
      setStartedAt(data.startedAt);
      onPatch({ reading_started_at: data.startedAt });
    } catch (problem) {
      setNote(problem instanceof Error ? problem.message : tr("计时启动失败。", "Could not start the clock."));
    } finally {
      setBusy("");
    }
  }

  // Marked: the score, what they put, and the key if the teacher uploaded one.
  if (result) {
    return (
      <div className="mock-part">
        <span className="student-card-label">{t("4 · 阅读", "4 · Reading")}</span>
        <div className="overview-hours-row">
          <span className="mock-result-score">
            {result.correct}/{result.total}
          </span>
          {readingBand(result.correct, result.total) !== null && (
            <span className="pill">
              {t(`参考 Band ${readingBand(result.correct, result.total)}`, `Band ${readingBand(result.correct, result.total)}`)}
            </span>
          )}
        </div>
        {note && <p className="hint">{note}</p>}
        <ol className="mock-answer-list reading">
          {(result.detail || []).map((item) => (
            <li className={item.correct ? "right" : "wrong"} key={item.question}>
              <span className="mock-answer-no">{item.question}</span>
              <span className="mock-answer-text">{item.answer || t("（未作答）", "(blank)")}</span>
              <span aria-hidden="true">{item.correct ? "✓" : "✕"}</span>
            </li>
          ))}
        </ol>
        {done && exam.reading_answer_path && (
          <>
            <div className="overview-hours-row">
              <button className="btn" type="button" onClick={() => setShowKey(!showKey)}>
                {showKey ? t("收起答案", "Hide the key") : t("查看阅读答案", "See the answer key")}
              </button>
              <a className="btn ghost" href={`/api/mock-exam/paper?examId=${exam.id}&part=readingAnswer`} target="_blank" rel="noreferrer">
                {t("在新标签页打开", "Open in a new tab")}
              </a>
            </div>
            {showKey && <iframe className="mock-paper-frame" title={t("阅读答案", "Reading answers")} src={`/api/mock-exam/paper?examId=${exam.id}&part=readingAnswer`} />}
          </>
        )}
        {!done && <p className="hint">{t("答案解析会在你点「模考完成」之后解锁。", "The key unlocks once you press Finish the exam.")}</p>}
      </div>
    );
  }

  if (!exam.reading_path || !total) {
    return (
      <div className="mock-part">
        <span className="student-card-label">{t("4 · 阅读", "4 · Reading")}</span>
        <em>{t("老师还没有上传阅读试卷。", "No reading paper yet.")}</em>
      </div>
    );
  }

  return (
    <div className="mock-part">
      <span className="student-card-label">{t("4 · 阅读", "4 · Reading")}</span>

      {!startedAt ? (
        <p className="exam-start-note">
          {t(
            `点开试卷文件后，倒计时会启动。雅思正式考试时长是 60min，这里由于需要下载、输入答案，时间延长至 ${minutes}min。请把握好时间，准备好后再点击题目。`,
            `Opening the paper starts the clock. The real IELTS paper is 60 minutes; here it is ${minutes}, because the paper has to be downloaded and the answers typed. Take your time getting ready, then open it.`
          )}
          {/* The paper is sat on its own page, so the sheet is not here any
              more — two sheets saving to the same place would fight. */}
          <strong className="exam-start-warn">
            {t(
              "试卷和答题卡在同一个考试页面里，左右分栏。做完记得点交卷。",
              "The paper and the answer sheet share one exam screen, side by side. Remember to hand in when you are done."
            )}
          </strong>
        </p>
      ) : (
        <div className={`exam-clock ${remaining <= 300 ? "low" : ""}`}>
          <span className="exam-clock-label">{t("阅读剩余", "Reading left")}</span>
          <strong>{formatClock(remaining)}</strong>
        </div>
      )}

      <div className="overview-hours-row">
        <button className="btn" type="button" disabled={busy === "start"} onClick={() => openPaper()}>
          {startedAt ? t("继续阅读考试", "Carry on with the paper") : t("开始阅读考试", "Start the reading paper")}
        </button>
        {exam.reading_name && <small>{exam.reading_name}</small>}
      </div>

      {startedAt && (
        <p className="hint">
          {t(
            "考试在新标签页里进行；关掉也没关系，作答已经保存，点上面的按钮可以回去接着做。",
            "The exam runs in its own tab. Closing it is fine — your answers are saved and the button above takes you back."
          )}
        </p>
      )}

      {note && <p className="hint">{note}</p>}
    </div>
  );
}


function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The four skills and the overall, as the certificate reports them.
 *
 * Shown in full only once all four are there; until then the student sees
 * which ones are still being marked rather than a number that is three
 * quarters of an answer.
 */
function StudentOverall({
  listening,
  reading,
  writing,
  speaking
}: {
  listening: number | null;
  reading: number | null;
  writing: number | null;
  speaking: number | null;
}) {
  const { t } = useLanguage();
  const parts = [
    { label: t("听力", "Listening"), band: listening },
    { label: t("阅读", "Reading"), band: reading },
    { label: t("写作", "Writing"), band: writing },
    { label: t("口语", "Speaking"), band: speaking }
  ];
  const overall = overallBand([listening, reading, writing, speaking]);
  const waiting = parts.filter((part) => typeof part.band !== "number").map((part) => part.label);

  return (
    <div className="overall-card">
      <div className="overall-parts">
        {parts.map((part) => (
          <div className={`overall-part ${typeof part.band === "number" ? "" : "pending"}`} key={part.label}>
            <span>{part.label}</span>
            <strong>{typeof part.band === "number" ? part.band.toFixed(1) : "—"}</strong>
          </div>
        ))}
        <div className={`overall-part total ${overall === null ? "pending" : ""}`}>
          <span>{t("总分", "Overall")}</span>
          <strong>{overall === null ? "—" : overall.toFixed(1)}</strong>
        </div>
      </div>
      {overall === null && (
        <p className="hint">{t(`等待评分：${waiting.join("、")}`, `Still being marked: ${waiting.join(", ")}`)}</p>
      )}
    </div>
  );
}

/** The speaking score, once the teacher has published it. */
function SpeakingResult({ score }: { score: SpeakingScore }) {
  const { t } = useLanguage();
  return (
    <div className="speaking-result">
      <div className="overview-hours-row">
        <span className="mock-result-score">{score.band === null ? "—" : score.band.toFixed(1)}</span>
        <span className="hint">{t("口语总分", "Speaking band")}</span>
      </div>
      <div className="speaking-grid">
        {speakingCriteria.map((item) => (
          <div className="speaking-cell read-only" key={item.key}>
            <span>{t(item.zh, item.en)}</span>
            <strong>{score.criteria?.[item.key] === undefined ? "—" : Number(score.criteria[item.key]).toFixed(1)}</strong>
          </div>
        ))}
      </div>
      {score.comment && <p className="speaking-note">{score.comment}</p>}
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
