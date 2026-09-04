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
        {t("口语作业，", "Mark speaking homework")}
        <br />
        {t("像改作文一样改", "the way you mark writing")}
      </h1>

      <p className="landing-lede">
        {t(
          "学生录音上传后自动转成逐字稿。你在文字上直接修改、划出问题、录一段示范回答，发布后学生看到的是一份完整的批改稿——不是一句「注意语法」。",
          "A student's recording becomes a transcript you can actually work on. Edit it in place, mark what went wrong, record a model answer, and publish — the student gets marked-up work, not a note saying \"watch your grammar\"."
        )}
      </p>

      {/* The product's own review colours, on a real correction. Nothing else on
          the page says "this is for spoken English" as immediately. */}
      <figure className="landing-sample">
        <figcaption>{t("老师改过的一段转写", "A transcript after marking")}</figcaption>
        <p className="tracked-text">
          I <del>use</del>
          <ins>used</ins> headphones on the bus <ins>every day</ins>, and it <del>make</del>
          <ins>made</ins> the trip shorter.
        </p>
        <p className="landing-annotation">
          <span>{t("批注", "Note")}</span>
          {t(
            "讲过去的习惯要用一般过去时，后面的 make 也要跟着变成 made。",
            "A past habit takes the past simple, and the verb after it has to follow: make becomes made."
          )}
        </p>
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
          "用手机号注册，网页直接用，学生不需要下载任何 App。老师账号需要授权码才能开通。",
          "Sign up with a phone number and work in the browser; students install nothing. Teacher accounts open with an activation code."
        )}
      </p>
    </main>
  );
}
