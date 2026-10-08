"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";

/**
 * The answer sheet as a small window the student puts wherever it suits
 * them.
 *
 * Both halves of the screen are the paper now, so the sheet floats over it:
 * dragged by its bar, scrolled inside, rolled up when it is in the way. Where
 * it was left is remembered per browser — a convenience, not exam data, so it
 * stays in the browser rather than going to the server.
 */

const spot = "graderley.answer-window";

export function AnswerWindow({
  answers,
  flags,
  current,
  onAnswer,
  onFlag,
  onFocus
}: {
  answers: string[];
  flags: number[];
  current: number;
  onAnswer: (index: number, value: string) => void;
  onFlag: (number: number) => void;
  onFocus: (number: number) => void;
}) {
  const { t } = useLanguage();
  const [at, setAt] = useState({ x: 0, y: 0 });
  const [rolled, setRolled] = useState(false);
  const [placed, setPlaced] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // Where it was left, or out of the way on the right to begin with.
  useEffect(() => {
    let start = { x: Math.max(16, window.innerWidth - 340), y: 140 };
    try {
      const kept = JSON.parse(localStorage.getItem(spot) || "null");
      if (kept && typeof kept.x === "number" && typeof kept.y === "number") start = kept;
    } catch {
      // A browser that will not keep it simply starts it where it always was.
    }
    setAt(clamp(start));
    setPlaced(true);
  }, []);

  useEffect(() => {
    if (!placed) return;
    try {
      localStorage.setItem(spot, JSON.stringify(at));
    } catch {
      // Not worth telling anyone about.
    }
  }, [at, placed]);

  // The question the navigator jumped to is scrolled into the window.
  useEffect(() => {
    const box = boxes.current[current - 1];
    if (box) box.scrollIntoView({ block: "nearest" });
  }, [current]);

  function drag(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest("button")) return;
    const from = { x: event.clientX, y: event.clientY };
    const origin = { ...at };
    const move = (e: PointerEvent) => setAt(clamp({ x: origin.x + (e.clientX - from.x), y: origin.y + (e.clientY - from.y) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  if (!placed) return null;

  return (
    <div className={`answer-window ${rolled ? "rolled" : ""}`} style={{ left: at.x, top: at.y }}>
      <div className="answer-window-bar" onPointerDown={drag}>
        <strong>{t("答题卡", "Answers")}</strong>
        <span className="hint">
          {answers.filter((value) => value.trim()).length}/{answers.length}
        </span>
        <button className="answer-window-roll" type="button" onClick={() => setRolled((on) => !on)}>
          {rolled ? "▣" : "—"}
        </button>
      </div>
      {!rolled && (
        <div className="answer-window-body">
          {answers.map((value, index) => {
            const number = index + 1;
            return (
              <label className={`answer-row ${current === number ? "current" : ""} ${flags.includes(number) ? "flagged" : ""}`} key={number}>
                <span>{number}</span>
                <input
                  ref={(node) => {
                    boxes.current[index] = node;
                  }}
                  value={value}
                  onFocus={() => onFocus(number)}
                  onChange={(event) => onAnswer(index, event.target.value)}
                  onKeyDown={(event) => {
                    // Enter walks down the sheet, the way tabbing through a
                    // paper form does, so forty answers can be typed without
                    // reaching for the mouse between each one.
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const step = event.shiftKey ? -1 : 1;
                    const next = boxes.current[index + step];
                    if (next) {
                      next.focus();
                      next.select();
                    }
                  }}
                />
                <button
                  className="answer-row-flag"
                  type="button"
                  title={t("标记这道题", "Flag this question")}
                  onClick={(event) => {
                    event.preventDefault();
                    onFlag(number);
                  }}
                >
                  ⚑
                </button>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Never dragged so far that the bar cannot be grabbed again. */
function clamp({ x, y }: { x: number; y: number }) {
  const width = 320;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - 80))
  };
}
