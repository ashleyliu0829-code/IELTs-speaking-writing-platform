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
    <main className="shell">
      <section className="hero">
        <div>
          <div className="hero-actions">
            <button className="btn secondary" type="button" onClick={toggleLanguage}>
              {language === "zh" ? "English" : "中文"}
            </button>
          </div>
          <h1>{t("IELTS 作业平台", "IELTS Homework Platform")}</h1>
          <p>{t("老师可以布置口语和写作作业、查看学生提交、完成批改并发布反馈。", "Teachers can assign speaking and writing homework, review submissions, mark work, and publish feedback.")}</p>
        </div>
        <aside className="panel stack">
          <Link className="btn" href="/student">
            {t("学生登录", "Student login")}
          </Link>
          <Link className="btn secondary" href="/teacher">
            {t("老师登录", "Teacher login")}
          </Link>
          <Link className="btn secondary" href="/assistant">
            {t("助教登录", "Assistant login")}
          </Link>
          <p className="hint">{t("请先选择身份，再使用手机号登录或注册。", "Please choose your role first, then log in or register with your phone number.")}</p>
        </aside>
      </section>
    </main>
  );
}
