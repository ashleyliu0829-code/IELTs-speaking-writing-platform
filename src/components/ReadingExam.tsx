"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerWindow } from "@/components/AnswerWindow";
import { PaperPane, loadPdfjs, type PageSize, type PdfDocument } from "@/components/ReadingPaperPane";
import { tr, useLanguage } from "@/lib/i18n";
import { readReadingTimer } from "@/lib/readingSheet";
import type { ReadingResult } from "@/lib/types";

/**
 * The reading paper, sat the way the computer-based test is sat.
 *
 * The screen is the paper twice over — one document open in two windows,
 * each scrolled wherever it is wanted, because that is how the test is read:
 * the passage held still on one side while the questions move on the other.
 * The answer sheet floats over them as a small window dragged wherever it
 * suits, and a pen lets the student scribble on the paper as they would on
 * a printed one.
 *
 * Everything they type or draw is saved as they go. A reading exam that
 * loses work because a laptop closed is worse than no reading exam.
 */

export type Stroke = {
  id: string;
  page: number;
  /** Which of the two views it was drawn in; they are separate papers. */
  side?: "left" | "right";
  color?: string;
  width?: number;
  points: [number, number][];
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
  reading_marks: Stroke[];
  reading_result: ReadingResult | null;
  completed_at: string | null;
};

const saveEvery = 15_000;
const inks = ["#d64a2f", "#2f7fd6", "#3f9e5a"];

export function ReadingExam({ examId }: { examId: string }) {
  const { t } = useLanguage();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [flags, setFlags] = useState<number[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState(1);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [split, setSplit] = useState(50);
  const [pen, setPen] = useState(false);
  const [color, setColor] = useState(inks[0]);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);

  const state = useRef({ answers, flags, strokes });
  state.current = { answers, flags, strokes };
  const handedIn = useRef(false);

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
        setStrokes(found.reading_marks || []);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : tr("无法加载试卷。", "Could not load the paper."));
      }
    })();
  }, [examId]);

  // One document for both views: fetched, parsed and measured once.
  useEffect(() => {
    if (!exam?.reading_path) return;
    let cancelled = false;
    let doc: PdfDocument | null = null;
    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const loaded = await pdfjs.getDocument({ url: `/api/mock-exam/paper?examId=${exam.id}&part=reading&stream=1` }).promise;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        doc = loaded;
        const measured: PageSize[] = [];
        for (let number = 1; number <= loaded.numPages; number += 1) {
          const page = await loaded.getPage(number);
          const viewport = page.getViewport({ scale: 1 });
          measured.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setSizes(measured);
        setPdf(loaded);
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : tr("试卷打不开。", "The paper would not open."));
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [exam?.id, exam?.reading_path]);

  // PDF.js draws in chunks scheduled on animation frames, and a browser gives
  // none of those to a tab that is not on screen — the exam opens in its own
  // tab, so it is often exactly that tab. Standing in for the scheduler while
  // it is hidden is the only way through; the frames are never coming.
  useEffect(() => {
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const standIns = new Set<number>();
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      if (document.visibilityState !== "hidden") return nativeRequest(callback);
      const id = window.setTimeout(() => {
        standIns.delete(id);
        callback(performance.now());
      }, 16);
      standIns.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id: number) => {
      if (standIns.delete(id)) window.clearTimeout(id);
      else nativeCancel(id);
    };
    return () => {
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      standIns.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const save = useCallback(
    async (action: "reading-save" | "reading-submit") => {
      const response = await fetch("/api/student/mock-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          action,
          answers: state.current.answers,
          flags: state.current.flags,
          marks: state.current.strokes
        })
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
        setExam((item) => (item ? { ...item, reading_result: data.result } : item));
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

  useEffect(() => {
    if (!exam || exam.reading_result) return;
    const loop = window.setInterval(() => {
      void save("reading-save").catch(() => undefined);
    }, saveEvery);
    return () => window.clearInterval(loop);
  }, [exam, save]);

  // Closing the tab saves rather than losing the last few answers.
  useEffect(() => {
    const onHide = () => {
      if (!exam || exam.reading_result) return;
      const body = JSON.stringify({
        examId,
        action: "reading-save",
        answers: state.current.answers,
        flags: state.current.flags,
        marks: state.current.strokes
      });
      navigator.sendBeacon?.("/api/student/mock-exams", new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [exam, examId]);

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

        <div className="exam-pen">
          <button className={`btn ghost ${pen ? "on" : ""}`} type="button" onClick={() => setPen((on) => !on)}>
            {pen ? t("画笔：开", "Pen: on") : t("画笔：关", "Pen: off")}
          </button>
          {pen && (
            <>
              {inks.map((ink) => (
                <button
                  key={ink}
                  type="button"
                  className={`exam-ink ${color === ink ? "on" : ""}`}
                  style={{ background: ink }}
                  title={t("换颜色", "Change colour")}
                  onClick={() => setColor(ink)}
                />
              ))}
              <button className="btn ghost" type="button" disabled={!strokes.length} onClick={() => setStrokes((list) => list.slice(0, -1))}>
                {t("撤销", "Undo")}
              </button>
              <button className="btn ghost" type="button" disabled={!strokes.length} onClick={() => clearInk()}>
                {t("清除", "Clear")}
              </button>
            </>
          )}
        </div>

        <div className={`exam-shell-clock ${remaining <= 300 ? "low" : ""}`}>
          <span>{t("剩余", "Time left")}</span>
          <strong>{clock(remaining)}</strong>
        </div>
        <div className="exam-shell-count">{t(`已答 ${answered}/${answers.length}`, `${answered}/${answers.length} answered`)}</div>
        <button className="btn" type="button" disabled={busy === "submit"} onClick={() => void confirmHand()}>
          {busy === "submit" ? t("提交中...", "Handing in...") : t("交卷", "Hand in")}
        </button>
      </header>

      <div className="exam-shell-body" style={{ gridTemplateColumns: `${split}% 6px 1fr` }}>
        <PaperPane pdf={pdf} sizes={sizes} side="left" label={t("试卷 · 左", "Paper · left")} pen={pen} color={color} strokes={strokes} onDraw={(stroke) => setStrokes((list) => [...list, stroke])} />

        <div
          className="exam-shell-grip"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={(event) => {
            const start = event.clientX;
            const from = split;
            const width = event.currentTarget.parentElement?.clientWidth || 1;
            const move = (e: PointerEvent) => setSplit(Math.min(80, Math.max(20, from + ((e.clientX - start) / width) * 100)));
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        />

        <PaperPane pdf={pdf} sizes={sizes} side="right" label={t("试卷 · 右", "Paper · right")} pen={pen} color={color} strokes={strokes} onDraw={(stroke) => setStrokes((list) => [...list, stroke])} />
      </div>

      <AnswerWindow
        answers={answers}
        flags={flags}
        current={current}
        onAnswer={(index, value) => setAnswers((list) => list.map((entry, at) => (at === index ? value : entry)))}
        onFlag={(number) => setFlags((list) => (list.includes(number) ? list.filter((n) => n !== number) : [...list, number]))}
        onFocus={setCurrent}
      />

      <footer className="exam-shell-nav">
        {answers.map((value, index) => {
          const number = index + 1;
          return (
            <button
              key={number}
              type="button"
              className={`exam-nav-dot ${value.trim() ? "done" : ""} ${flags.includes(number) ? "flagged" : ""} ${current === number ? "current" : ""}`}
              onClick={() => setCurrent(number)}
            >
              {number}
            </button>
          );
        })}
      </footer>

      {note && <p className="exam-shell-note">{note}</p>}
    </div>
  );

  function clearInk() {
    if (!window.confirm(tr("清除这份试卷上画的全部内容？", "Clear everything drawn on this paper?"))) return;
    setStrokes([]);
  }

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
