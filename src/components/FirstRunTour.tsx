"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";

/**
 * The first-run tour: a spotlight that glides from one part of the workspace
 * to the next, with a card explaining what lives there.
 *
 * It runs once per account per browser (the flag is in localStorage), the
 * first time the dashboard opens with the example student in place, and can
 * be replayed from the banner. Nothing is rendered until the target elements
 * exist, and the spotlight follows them on resize, so the tour never points
 * at empty space.
 *
 * The overlay is one fixed box whose enormous box-shadow dims everything
 * around the cut-out; moving the box moves the hole, and the transition on
 * its geometry is the animation.
 */

type Step = {
  target: string | null;
  zh: [string, string];
  en: [string, string];
};

const steps: Step[] = [
  {
    target: null,
    zh: ["欢迎来到 Graderley", "花 30 秒看看工作台的四个区域。工作台里已经有一位「示例学生」，每个页面都有内容可以点开试。"],
    en: ["Welcome to Graderley", "Thirty seconds on the four parts of the workspace. An example student is already here, so every page has something to try."]
  },
  {
    target: '[data-tour="publish"]',
    zh: ["作业布置", "口语作业从内置题库点选发布，写作作业设 Task 1 / Task 2；每日任务让学生每天打卡。"],
    en: ["Set homework", "Speaking homework from the built-in topic bank, writing with Task 1 / Task 2; daily tasks the student checks off each day."]
  },
  {
    target: '[data-tour="grading"]',
    zh: ["作业批改", "示例学生有一份待批改的口语作业：播放录音、修改转写、加批注、录示范回答，然后发布。建议从这里开始。"],
    en: ["Marking", "The example student has a speaking homework waiting: play the recordings, edit the transcript, add notes, record a sample answer, publish. Start here."]
  },
  {
    target: '[data-tour="schedule"]',
    zh: ["排课管理", "在周历上标出可预约时段，学生自己约；每节课上完在「课程进度」里填课题、打勾。"],
    en: ["Scheduling", "Mark bookable slots on the week; students book themselves. After each lesson, fill in the topic on Lesson progress and tick it off."]
  },
  {
    target: '[data-tour="students"]',
    zh: ["学生档案", "全班总览和每个学生的卡片。「学生注册」里的链接发给学生，他们注册后自动进入你的班级。"],
    en: ["Student archive", "The whole class at a glance and a card per student. Send the sign-up link from Student sign-up; students land in your workspace on their own."]
  },
  {
    target: ".topbar-tools",
    zh: ["中英文切换", "右上角随时切换界面语言。准备好了就去批改那份示例作业吧。"],
    en: ["Language", "Switch the interface language here any time. Now go and mark that example homework."]
  }
];

const storageKey = (accountId: string) => `tourDone:${accountId}`;

export function tourSeen(accountId: string) {
  try {
    return window.localStorage.getItem(storageKey(accountId)) === "1";
  } catch {
    return true;
  }
}

type Box = { top: number; left: number; width: number; height: number };

export function FirstRunTour({ accountId, onFinish, onStartGrading }: { accountId: string; onFinish: () => void; onStartGrading: () => void }) {
  const { language } = useLanguage();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  // Measure the current target; re-measure on resize. A missing target
  // (narrow screen, rail collapsed) shows the card centred instead.
  useLayoutEffect(() => {
    function measure() {
      if (!step.target) return setBox(null);
      const element = document.querySelector(step.target);
      if (!element) return setBox(null);
      const rect = element.getBoundingClientRect();
      const pad = 8;
      setBox({ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  function finish() {
    try {
      window.localStorage.setItem(storageKey(accountId), "1");
    } catch {
      // Nothing to remember it in; the tour will simply show again.
    }
    onFinish();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight" && !last) setIndex((i) => i + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, last]);

  const [title, body] = language === "zh" ? step.zh : step.en;
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);

  // The card sits to the right of a rail target, below a topbar target, or
  // in the middle when there is no target.
  const cardStyle: React.CSSProperties = box
    ? box.top < 80
      ? { top: box.top + box.height + 14, left: Math.max(16, Math.min(box.left + box.width - 360, window.innerWidth - 376)) }
      : { top: Math.min(box.top, window.innerHeight - 260), left: box.left + box.width + 18 }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`tour-spotlight ${box ? "" : "hidden-hole"}`}
        style={box ? { top: box.top, left: box.left, width: box.width, height: box.height } : { top: "50%", left: "50%", width: 0, height: 0 }}
        aria-hidden="true"
      />
      <div className="tour-card" style={cardStyle}>
        <div className="tour-progress">
          {steps.map((_, i) => (
            <i className={i === index ? "on" : i < index ? "done" : ""} key={i} />
          ))}
        </div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="tour-actions">
          <button className="btn link" type="button" onClick={finish}>
            {t("跳过", "Skip")}
          </button>
          <span className="tour-count">
            {index + 1} / {steps.length}
          </span>
          {index > 0 && (
            <button className="btn secondary" type="button" onClick={() => setIndex(index - 1)}>
              {t("上一步", "Back")}
            </button>
          )}
          {last ? (
            <button
              className="btn accent"
              type="button"
              onClick={() => {
                finish();
                onStartGrading();
              }}
            >
              {t("去批改示例作业", "Mark the example")}
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => setIndex(index + 1)}>
              {t("下一步", "Next")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
