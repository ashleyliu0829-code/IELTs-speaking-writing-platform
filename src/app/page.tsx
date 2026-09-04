"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HomeLanguage = "zh" | "en";

export default function Home() {
  const [language, setLanguage] = useState<HomeLanguage>("zh");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("homeLanguage");
    if (savedLanguage === "zh" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);

  function toggleLanguage() {
    setLanguage((current) => {
      const next = current === "zh" ? "en" : "zh";
      window.localStorage.setItem("homeLanguage", next);
      return next;
    });
  }

  function t(zh: string, en: string) {
    return language === "zh" ? zh : en;
  }

  return (
    <main className="landing">
      <button className="landing-lang" type="button" onClick={toggleLanguage}>
        {language === "zh" ? "English" : "中文"}
      </button>

      <h1 className="landing-title">
        {t("专为雅思老师打造的", "Built for IELTS teachers:")}
        <br />
        {t("口语作业批改一体化平台", "speaking homework, marked end to end")}
      </h1>

      <p className="landing-lede">
        {t(
          "布置作业、学生录音、自动转写、逐句批改、发布反馈，在一个平台里走完。",
          "Set the homework, collect the recordings, transcribe them, mark them line by line, publish the feedback — all in one place."
        )}
      </p>

      {/* One question as the teacher sees it while marking, built from the same
          pieces as the real card: the prompt, the recording, the transcript and
          the note. It is a still, not a working player — nothing here is wired
          up, and it should not pretend to be. */}
      <figure className="landing-sample" aria-label={t("批改一道口语题时的界面", "Marking one speaking question")}>
        <div className="landing-sample-block">
          <p className="landing-sample-meta">Part 2 · 1:47</p>
          <p className="landing-sample-question">
            Describe a journey you remember well. You should say where you went, how you travelled, and
            explain why you remember it.
          </p>
        </div>

        <div className="landing-player" aria-hidden="true">
          <span className="landing-player-play">
            <svg viewBox="0 0 12 14" width="11" height="13" focusable="false">
              <path d="M1 1l10 6-10 6z" fill="currentColor" />
            </svg>
          </span>
          <span className="landing-player-track">
            <span />
          </span>
          <span className="landing-player-time">0:34 / 1:47</span>
        </div>

        <div className="landing-sample-block">
          <div className="landing-sample-bar">
            <span className="landing-sample-label">{t("录音转写", "Transcript")}</span>
            <span className="landing-sample-btn">{t("重新生成转写", "Transcribe again")}</span>
          </div>
          <p className="tracked-text">
            I went to Suzhou last spring, and I <del>take</del>
            <ins>took</ins> the high-speed train, because it <del>take</del>
            <ins>takes</ins> only half an hour from Shanghai. The seats <del>was</del>
            <ins>were</ins> comfortable, so I <del>feel</del>
            <ins>felt</ins> quite relaxed.
          </p>
          <p className="landing-annotation">
            <span>{t("批注", "Note")}</span>
            {t(
              "讲过去的经历统一用一般过去时；只有「车程半小时」是现在依然成立的事实，所以留在现在时。",
              "A past experience stays in the past simple throughout. Only the half-hour journey time is still true today, which is why it keeps the present."
            )}
          </p>
        </div>
      </figure>

      <nav className="landing-entry">
        <Link className="btn" href="/teacher">
          {t("老师登录", "Teacher login")}
        </Link>
        <Link className="btn secondary" href="/student">
          {t("学生登录", "Student login")}
        </Link>
        <Link className="btn link landing-assistant" href="/assistant">
          {t("助教入口", "Assistant")}
        </Link>
      </nav>

      <p className="landing-foot">
        {t(
          "网页操作，手机号注册，无需下载APP",
          "Works in the browser. Sign up with a phone number, no app to download."
        )}
      </p>
    </main>
  );
}
