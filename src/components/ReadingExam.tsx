"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";
import { readReadingTimer } from "@/lib/readingSheet";
import { PaperPane } from "@/components/ReadingPaperPane";
import type { ReadingResult } from "@/lib/types";

/**
 * The reading paper, sat the way the computer-based test is sat: the passage
 * on the left and the answer sheet on the right, a clock in the corner and a
 * row of question numbers along the bottom.
 *
 * The paper is a PDF, so the right-hand side is numbered boxes rather than
 * the real test's radio buttons — the platform cannot know that question 7
 * is a three-way choice when the question only exists inside the file. What
 * it can do is everything around that: the split screen, the clock that
 * cannot be restarted, highlighting, notes, flagging a question to come back
 * to, and a hand-in that marks itself.
 *
 * Everything the student does is saved as they go. A reading exam that loses
 * work because a laptop closed is worse than no reading exam.
 */

type Mark = {
  id: string;
  page: number;
  color?: string;
  note?: string;
  rects: { x: number; y: number; w: number; h: number }[];
};

type Exam = {
  id: string;
  title: string;
  student_name: string;
  reading_name: string;
  reading_path: string;
  reading_total: number;
  reading_minutes: number;
  reading_started_at: string | null;
  reading_draft: string[];
  reading_flags: number[];
  reading_marks: Mark[];
  reading_result: ReadingResult | null;
  completed_at: string | null;
};

const saveEvery = 15_000;

export function ReadingExam({ examId }: { examId: string }) {
  const { t } = useLanguage();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [flags, setFlags] = useState<number[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [current, setCurrent] = useState(1);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [split, setSplit] = useState(58);
  const [noteFor, setNoteFor] = useState<Mark | null>(null);

  const state = useRef({ answers, flags, marks });
  state.current = { answers, flags, marks };
  const handedIn = useRef(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/student/mock-exams");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || tr("无法加载试卷。", "Could not load the paper."));
        const found = (body.exams || []).find((item: Exam) => item.id === examId);
        if (!found) throw new Error(tr("找不到这场模考。", "Could not find this sitting."));
        setExam(found);
        setAnswers(Array.from({ length: found.reading_total || 0 }, (_, i) => found.reading_draft?.[i] || ""));
        setFlags(found.reading_flags || []);
        setMarks(found.reading_marks || []);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : tr("无法加载试卷。", "Could not load the paper."));
      }
    })();
  }, [examId]);

  const save = useCallback(
    async (action: "reading-save" | "reading-submit") => {
      const body = {
        examId,
        action,
        answers: state.current.answers,
        flags: state.current.flags,
        marks: state.current.marks
      };
      const response = await fetch("/api/student/mock-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("保存失败。", "Could not save."));
      return data;
    },
    [examId]
  );

  const hand = useCallback(
    async (auto: boolean) => {
      if (handedIn.current) return;
      handedIn.current = true;
      setBusy("submit");
      try {
        const data = await save("reading-submit");
        setExam((current) => (current ? { ...current, reading_result: data.result } : current));
        setNote(auto ? tr("时间到，答案已自动提交。", "Time is up; your sheet was handed in.") : "");
      } catch (problem) {
        handedIn.current = false;
        setNote(problem instanceof Error ? problem.message : tr("提交失败。", "Could not hand it in."));
      } finally {
        setBusy("");
      }
    },
    [save]
  );

  // The clock, worked out from the moment the server stored.
  useEffect(() => {
    if (!exam || exam.reading_result) return;
    const tick = () => {
      const timer = readReadingTimer(exam.reading_minutes || 0, exam.reading_started_at);
      setRemaining(timer.remainingSeconds);
      if (timer.expired) void hand(true);
    };
    tick();
    const loop = window.setInterval(tick, 1000);
    return () => window.clearInterval(loop);
  }, [exam, hand]);

  // Saved as they go: answers, flags and highlights together.
  useEffect(() => {
    if (!exam || exam.reading_result) return;
    const loop = window.setInterval(() => {
      void save("reading-save").catch(() => undefined);
    }, saveEvery);
    return () => window.clearInterval(loop);
  }, [exam, save]);

  // Leaving mid-exam saves rather than losing the last few answers.
  useEffect(() => {
    const onHide = () => {
      if (!exam || exam.reading_result) return;
      const body = JSON.stringify({ examId, action: "reading-save", answers: state.current.answers, flags: state.current.flags, marks: state.current.marks });
      navigator.sendBeacon?.("/api/student/mock-exams", new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [exam, examId]);

  function go(number: number) {
    setCurrent(number);
    const box = boxes.current[number - 1];
    box?.focus();
    box?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function toggleFlag(number: number) {
    setFlags((list) => (list.includes(number) ? list.filter((n) => n !== number) : [...list, number]));
  }

  if (error) return <div className="exam-shell-message">{error}</div>;
  if (!exam) return <div className="exam-shell-message">{t("加载中...", "Loading...")}</div>;

  if (exam.reading_result) {
    const result = exam.reading_result;
    return (
      <div className="exam-shell-message">
        <h1>{t("阅读已提交", "Reading handed in")}</h1>
        <p className="exam-shell-score">
          {result.correct}/{result.total}
        </p>
        {note && <p className="hint">{note}</p>}
        <a className="btn" href="/student">
          {t("返回模考页面", "Back to the mock exam")}
        </a>
      </div>
    );
  }

  const answered = answers.filter((value) => value.trim()).length;

  return (
    <div className="exam-shell">
      <header className="exam-shell-bar">
        <div>
          <strong>{exam.student_name}</strong>
          <small>{exam.title}</small>
        </div>
        <div className={`exam-shell-clock ${remaining <= 300 ? "low" : ""}`}>
          <span>{t("剩余", "Time left")}</span>
          <strong>{clock(remaining)}</strong>
        </div>
        <div className="exam-shell-count">
          {t(`已答 ${answered}/${answers.length}`, `${answered}/${answers.length} answered`)}
        </div>
        <button className="btn" type="button" disabled={busy === "submit"} onClick={() => void confirmHand()}>
          {busy === "submit" ? t("提交中...", "Handing in...") : t("交卷", "Hand in")}
        </button>
      </header>

      <div className="exam-shell-body" style={{ gridTemplateColumns: `${split}% 6px 1fr` }}>
        <PaperPane
          src={`/api/mock-exam/paper?examId=${exam.id}&part=reading&stream=1`}
          marks={marks}
          onAdd={(mark) => setMarks((list) => [...list, mark])}
          onOpenNote={setNoteFor}
        />

        <div
          className="exam-shell-grip"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={(event) => {
            const start = event.clientX;
            const from = split;
            const width = event.currentTarget.parentElement?.clientWidth || 1;
            const move = (e: PointerEvent) => {
              const next = from + ((e.clientX - start) / width) * 100;
              setSplit(Math.min(75, Math.max(30, next)));
            };
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        />

        <section className="exam-sheet">
          <h2>{t("答题卡", "Answer sheet")}</h2>
          <p className="hint">{t("在 PDF 上拖选文字可以高亮，高亮后可以加笔记。", "Drag across the passage to highlight it; a highlight can carry a note.")}</p>
          <div className="exam-sheet-grid">
            {answers.map((value, index) => {
              const number = index + 1;
              return (
                <label className={`exam-sheet-cell ${current === number ? "current" : ""} ${flags.includes(number) ? "flagged" : ""}`} key={number}>
                  <span>{number}</span>
                  <input
                    ref={(node) => {
                      boxes.current[index] = node;
                    }}
                    value={value}
                    onFocus={() => setCurrent(number)}
                    onChange={(event) => setAnswers((list) => list.map((entry, at) => (at === index ? event.target.value : entry)))}
                  />
                  <button
                    className="exam-sheet-flag"
                    type="button"
                    title={t("标记这道题", "Flag this question")}
                    onClick={(event) => {
                      event.preventDefault();
                      toggleFlag(number);
                    }}
                  >
                    ⚑
                  </button>
                </label>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="exam-shell-nav">
        {answers.map((value, index) => {
          const number = index + 1;
          return (
            <button
              key={number}
              type="button"
              className={`exam-nav-dot ${value.trim() ? "done" : ""} ${flags.includes(number) ? "flagged" : ""} ${current === number ? "current" : ""}`}
              onClick={() => go(number)}
            >
              {number}
            </button>
          );
        })}
      </footer>

      {noteFor && (
        <NoteEditor
          mark={noteFor}
          onClose={() => setNoteFor(null)}
          onSave={(text) => {
            setMarks((list) => list.map((item) => (item.id === noteFor.id ? { ...item, note: text } : item)));
            setNoteFor(null);
          }}
          onRemove={() => {
            setMarks((list) => list.filter((item) => item.id !== noteFor.id));
            setNoteFor(null);
          }}
        />
      )}

      {note && <p className="exam-shell-note">{note}</p>}
    </div>
  );

  async function confirmHand() {
    const left = answers.length - answered;
    const warning = left
      ? tr(`还有 ${left} 题没有作答，确定交卷吗？交卷后立刻出分，不能再修改。`, `${left} questions are still blank. Hand in anyway? It is marked at once and cannot be undone.`)
      : tr("确定交卷吗？交卷后立刻出分，不能再修改。", "Hand in? It is marked at once and cannot be undone.");
    if (!window.confirm(warning)) return;
    await hand(false);
  }
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** A highlight's note, written in a small panel rather than a prompt box. */
function NoteEditor({
  mark,
  onClose,
  onSave,
  onRemove
}: {
  mark: Mark;
  onClose: () => void;
  onSave: (text: string) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState(mark.note || "");
  return (
    <div className="exam-note-backdrop" role="dialog" aria-modal="true">
      <div className="exam-note">
        <h3>{t("笔记", "Note")}</h3>
        <textarea rows={4} value={text} autoFocus onChange={(event) => setText(event.target.value)} />
        <div className="overview-hours-row">
          <button className="btn" type="button" onClick={() => onSave(text)}>
            {t("保存", "Save")}
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <button className="btn ghost" type="button" onClick={onRemove}>
            {t("删除高亮", "Remove the highlight")}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { Mark };
