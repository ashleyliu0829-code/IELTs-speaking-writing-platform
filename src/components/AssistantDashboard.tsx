"use client";

import { useEffect, useState } from "react";
import { TeacherSchedulePanel } from "@/components/LessonScheduler";

type AssistantAccount = {
  id: string;
  role: "assistant";
  phone: string;
  display_name: string;
  teacher_id?: string | null;
};

type AssistantLanguage = "zh" | "en";

export function AssistantDashboard() {
  const [account, setAccount] = useState<AssistantAccount | null>(null);
  const [language, setLanguage] = useState<AssistantLanguage>("zh");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [teacherPhone, setTeacherPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("assistantLanguage");
    if (savedLanguage === "zh" || savedLanguage === "en") setLanguage(savedLanguage);
    void loadCurrentAccount();
  }, []);

  function toggleLanguage() {
    setLanguage((current) => {
      const next = current === "zh" ? "en" : "zh";
      window.localStorage.setItem("assistantLanguage", next);
      return next;
    });
  }

  function t(zh: string, en: string) {
    return language === "zh" ? zh : en;
  }

  async function loadCurrentAccount() {
    const response = await fetch("/api/auth/me");
    const data = await response.json().catch(() => ({}));
    if (data.account?.role === "assistant") {
      setAccount(data.account);
      setName(data.account.display_name);
      setPhone(data.account.phone);
    }
  }

  async function submitAuth() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          phone,
          displayName: name,
          teacherPhone,
          password
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t("账号操作失败。", "Account action failed."));
      setAccount(data.account);
      setName(data.account.display_name);
      setPhone(data.account.phone);
      setMessage(t("已登录。", "Logged in."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("账号操作失败。", "Account action failed."));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setAccount(null);
    setMessage(t("已退出登录。", "Logged out."));
  }

  if (!account) {
    return (
      <main className="shell">
        <section className="auth-shell">
          <article className="card stack">
            <div>
              <div className="hero-actions">
                <button className="btn secondary" type="button" onClick={toggleLanguage}>
                  {language === "zh" ? "English" : "中文"}
                </button>
              </div>
              <h1>{t("助教登录", "Assistant Login")}</h1>
              <p className="hint">{t("助教账号绑定到主老师后，可以发布练习课空闲时间并确认学生预约。", "After connecting to a main teacher, assistant accounts can publish practice-lesson availability and confirm student bookings.")}</p>
            </div>
            <div className="segmented">
              <button className={`btn ${authMode === "login" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("login")}>
                {t("登录", "Login")}
              </button>
              <button className={`btn ${authMode === "register" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("register")}>
                {t("注册", "Register")}
              </button>
            </div>
            <div>
              <label>{t("手机号", "Phone number")}</label>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("请输入助教手机号", "Enter assistant phone number")} />
            </div>
            {authMode === "register" && (
              <>
                <div>
                  <label>{t("助教姓名", "Assistant name")}</label>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("请输入助教姓名", "Enter assistant name")} />
                </div>
                <div>
                  <label>{t("主老师手机号", "Main teacher phone number")}</label>
                  <input value={teacherPhone} onChange={(event) => setTeacherPhone(event.target.value)} placeholder={t("请输入主老师手机号", "Enter the main teacher phone number")} />
                  <p className="hint">{t("学生会通过主老师账号自动看到该助教的练习课时间。", "Students will automatically see this assistant's practice-lesson times through the main teacher account.")}</p>
                </div>
              </>
            )}
            <div>
              <label>{t("密码", "Password")}</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("至少 6 位字符", "At least 6 characters")} />
            </div>
            <button className="btn" disabled={loading || !phone || !password || (authMode === "register" && (!name || !teacherPhone))} onClick={submitAuth} type="button">
              {loading ? t("处理中...", "Processing...") : authMode === "login" ? t("登录", "Login") : t("创建助教账号", "Create assistant account")}
            </button>
            {message && <p className={message.includes("failed") || message.includes("incorrect") || message.includes("not found") ? "error" : "hint"}>{message}</p>}
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>{t("助教工作台", "Assistant Dashboard")}</h1>
          <p>{t("发布练习课空闲时间，并确认学生的练习课预约。", "Publish practice-lesson availability and confirm student bookings.")}</p>
          <div className="hero-actions">
            <button className="btn secondary" type="button" onClick={toggleLanguage}>
              {language === "zh" ? "English" : "中文"}
            </button>
            <button className="btn secondary" type="button" onClick={logout}>
              {t("退出登录", "Log out")}
            </button>
          </div>
        </div>
      </section>
      {message && <p className={message.includes("failed") || message.includes("Unauthorized") ? "error" : "hint"}>{message}</p>}
      <TeacherSchedulePanel
        token=""
        lessonType="practice"
        language={language}
        title={t("练习课排课", "Practice Lesson Scheduling")}
        hint={t("请发布自己的练习课空闲时间。学生预约后，需要助教确认；每节练习课为 1 小时。", "Publish your available practice-lesson times. Student bookings require assistant confirmation; each practice lesson is 1 hour.")}
      />
    </main>
  );
}
