"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AssignmentType, SpeakingPracticeRecording, SpeakingPracticeSubmission, Submission } from "@/lib/types";
import { StudentSchedulePanel } from "@/components/LessonScheduler";
import { StudentDailyTasksPanel } from "@/components/DailyTasks";
import { StudentHomePanels } from "@/components/StudentHome";
import { getSpeakingTopicIdsFromAssignments } from "@/lib/speakingProgress";
import { tr, useLanguage } from "@/lib/i18n";
import { activeAnnouncements } from "@/lib/announcements";
import homeworkIcon from "../../public/icons/workspace-homework.png";
import lessonSchedulingIcon from "../../public/icons/workspace-lesson-scheduling.png";

type AuthAccount = {
  id: string;
  role: "teacher" | "student" | "assistant";
  phone: string;
  display_name: string;
  teacher_id?: string | null;
};

type StudentAssignmentSummary = {
  id: string;
  title: string;
  deadline_text: string;
  due_date?: string | null;
  assignment_type?: AssignmentType;
  p1_questions?: string[];
  p2_prompt?: string;
  created_at?: string;
};

type StudentHomeworkStatus = "assigned" | "submitted" | "reviewed";

type StudentHomeworkRow = StudentAssignmentSummary & {
  status: StudentHomeworkStatus;
};

type StudentNotification = {
  id: string;
  title: string;
  message: string;
  href: string;
  tone: "assigned" | "reviewed" | "notice";
};

type LocalPracticeRecording = {
  blob: Blob;
  url: string;
  duration: number;
};

export function StudentPortal() {
  const { t } = useLanguage();
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [teacherPhone, setTeacherPhone] = useState("");
  const [password, setPassword] = useState("");
  const [activeArea, setActiveArea] = useState<AssignmentType>("speaking");
  const [activeView, setActiveView] = useState<"home" | "homework" | "dailyTasks" | "schedule">("home");
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[]>([]);
  const [allAssignments, setAllAssignments] = useState<StudentAssignmentSummary[]>([]);
  const [historySubmissions, setHistorySubmissions] = useState<Submission[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [practiceLoadingId, setPracticeLoadingId] = useState("");
  const [practiceMessage, setPracticeMessage] = useState("");
  const [speakingPractices, setSpeakingPractices] = useState<SpeakingPracticeSubmission[]>([]);
  const [activePractice, setActivePractice] = useState<SpeakingPracticeSubmission | null>(null);
  const [practiceRecordings, setPracticeRecordings] = useState<Record<string, LocalPracticeRecording>>({});
  const [practiceActiveKey, setPracticeActiveKey] = useState<string | null>(null);
  const [practiceProcessingKey, setPracticeProcessingKey] = useState<string | null>(null);
  const [practiceSeconds, setPracticeSeconds] = useState<Record<string, number>>({});
  const [practiceSavingKey, setPracticeSavingKey] = useState("");
  const practiceRecorderRef = useRef<MediaRecorder | null>(null);
  const practiceChunksRef = useRef<Blob[]>([]);
  const practiceTimerRef = useRef<number | null>(null);
  const practiceElapsedRef = useRef(0);
  const practicePanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const teacher = params.get("teacherPhone") || params.get("teacher") || "";
      if (teacher) {
        setTeacherPhone(teacher);
        setAuthMode("register");
      }
    }
    void loadCurrentAccount();
  }, []);

  useEffect(() => {
    if (!activePractice) return;
    setActiveView("homework");
    window.setTimeout(() => {
      practicePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [activePractice?.id]);

  async function loadCurrentAccount() {
    const response = await fetch("/api/auth/me");
    const data = await response.json().catch(() => ({}));
    if (data.account?.role === "student") {
      setAccount(data.account);
      setName(data.account.display_name);
      setPhone(data.account.phone);
      await loadAssignments(data.account.display_name, activeArea);
      await loadHistory(data.account.display_name);
      await loadSpeakingPractices();
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
          role: "student",
          phone,
          displayName: name,
          teacherPhone,
          password
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("账号操作失败。", "Account request failed."));
      setAccount(data.account);
      setName(data.account.display_name);
      setPhone(data.account.phone);
      await loadAssignments(data.account.display_name, activeArea);
      await loadHistory(data.account.display_name);
      await loadSpeakingPractices();
      setMessage(tr("已登录。", "Signed in."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("账号操作失败。", "Account request failed."));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setAccount(null);
    setAssignments([]);
    setAllAssignments([]);
    setHistorySubmissions([]);
    setSpeakingPractices([]);
    setActivePractice(null);
    setActiveView("home");
    setMessage(tr("已退出登录。", "Signed out."));
  }

  async function loadAssignments(studentName: string, area: AssignmentType) {
    const response = await fetch(`/api/student/assignments?studentName=${encodeURIComponent(studentName)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || tr("无法加载作业。", "Could not load homework."));
      return;
    }
    const nextAssignments = data.assignments || [];
    setAllAssignments(nextAssignments);
    setAssignments(
      nextAssignments.filter(
        (assignment: StudentAssignmentSummary) => (assignment.assignment_type || "speaking") === area
      )
    );
  }

  async function switchArea(area: AssignmentType) {
    setActiveArea(area);
    if (account) await loadAssignments(account.display_name, area);
  }

  async function loadHistory(studentName: string) {
    const response = await fetch("/api/student/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentName })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setHistorySubmissions(data.submissions || []);
  }

  async function loadSpeakingPractices() {
    const response = await fetch("/api/student/speaking-practice");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setSpeakingPractices(data.practices || []);
  }

  async function startSpeakingPractice(part: "p1" | "p2", topicId: string) {
    if (!account) {
      setMessage(tr("请先登录学生账号。", "Please sign in first."));
      return;
    }
    const loadingId = `${part}:${topicId}`;
    setPracticeLoadingId(loadingId);
    setPracticeMessage(tr("正在打开自主练习...", "Opening practice..."));
    setMessage("");
    try {
      const response = await fetch("/api/student/speaking-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicType: part, topicId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("无法打开这个练习。", "Could not open this practice."));
      if (!data.practice) throw new Error(tr("自主练习创建成功但没有返回内容，请刷新后重试。", "The practice was created but nothing came back; please refresh and try again."));
      setActivePractice(data.practice || null);
      setPracticeRecordings({});
      if (data.practice) {
        setSpeakingPractices((current) => upsertPractice(current, data.practice));
      }
      setPracticeMessage(tr("已打开自主练习。", "Practice opened."));
      setMessage(tr("已打开自主练习。", "Practice opened."));
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : tr("无法打开这个练习。", "Could not open this practice.");
      setPracticeMessage(nextMessage);
      setMessage(nextMessage);
    }
    setPracticeLoadingId("");
  }

  async function togglePracticeRecording(item: PracticeQuestionItem) {
    if (practiceActiveKey) {
      if (practiceActiveKey !== item.key) {
        setMessage(tr("请先停止当前录音，再开始下一题。", "Stop the current recording before starting the next question."));
        return;
      }
      practiceRecorderRef.current?.stop();
      stopPracticeTimer();
      setPracticeProcessingKey(item.key);
      setPracticeActiveKey(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(tr("当前浏览器不支持网页录音，请使用 Chrome、Edge 或 Safari。", "This browser cannot record audio. Please use Chrome, Edge or Safari."));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      practiceChunksRef.current = [];
      practiceElapsedRef.current = 0;
      practiceRecorderRef.current = recorder;
      setPracticeActiveKey(item.key);
      setPracticeSeconds((current) => ({ ...current, [item.key]: 0 }));
      setMessage("");

      practiceTimerRef.current = window.setInterval(() => {
        practiceElapsedRef.current += 1;
        setPracticeSeconds((current) => ({ ...current, [item.key]: (current[item.key] || 0) + 1 }));
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) practiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blobType = recorder.mimeType || practiceChunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(practiceChunksRef.current, { type: blobType });
        if (!blob.size) {
          setPracticeProcessingKey(null);
          setMessage(tr("录音为空，请重新录制这一题。", "The recording is empty; please record this question again."));
          return;
        }
        setPracticeRecordings((current) => {
          if (current[item.key]?.url) URL.revokeObjectURL(current[item.key].url);
          return {
            ...current,
            [item.key]: {
              blob,
              url: URL.createObjectURL(blob),
              duration: practiceElapsedRef.current || Math.max(1, practiceSeconds[item.key] || 1)
            }
          };
        });
        setPracticeProcessingKey(null);
      };
      recorder.start();
    } catch {
      setMessage(tr("无法开始录音，请检查麦克风权限。", "Could not start recording; check the microphone permission."));
      setPracticeActiveKey(null);
      setPracticeProcessingKey(null);
      stopPracticeTimer();
    }
  }

  async function uploadPracticeRecording(item: PracticeQuestionItem) {
    if (!account || !activePractice) return;
    const recording = practiceRecordings[item.key];
    if (!recording) {
      setMessage(tr("请先录制这一题。", "Record this question first."));
      return;
    }

    const formData = new FormData();
    formData.append("practiceId", activePractice.id);
    formData.append("item", JSON.stringify(item));
    formData.append("duration", String(recording.duration));
    formData.append("audio", recording.blob, `${item.key}.${audioExtension(recording.blob.type)}`);
    const response = await fetch("/api/student/speaking-practice", { method: "PUT", body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || tr("保存录音失败。", "Could not save the recording."));
    return data.practice as SpeakingPracticeSubmission | undefined;
  }

  async function saveAllPracticeRecordings(items: PracticeQuestionItem[]) {
    if (!account || !activePractice) return;
    if (practiceActiveKey || practiceProcessingKey) {
      setMessage(tr("请先停止当前录音，再统一保存。", "Stop the current recording before saving."));
      return;
    }
    const unsavedItems = items.filter((item) => practiceRecordings[item.key]);
    if (!unsavedItems.length) {
      setMessage(tr("当前没有新录制但未保存的音频。", "There is nothing new to save."));
      return;
    }

    setMessage("");
    setPracticeSavingKey("__all");
    let latestPractice: SpeakingPracticeSubmission | undefined;
    try {
      for (const item of unsavedItems) {
        setPracticeSavingKey(item.key);
        latestPractice = await uploadPracticeRecording(item);
        setPracticeRecordings((current) => {
          const next = { ...current };
          if (next[item.key]?.url) URL.revokeObjectURL(next[item.key].url);
          delete next[item.key];
          return next;
        });
      }
      if (latestPractice) {
        const savedPractice = latestPractice;
        setActivePractice(savedPractice);
        setSpeakingPractices((current) => upsertPractice(current, savedPractice));
      }
      setMessage(tr(`已保存 ${unsavedItems.length} 条录音。下次打开仍可继续；点击提交后老师才能看到。`, `Saved ${unsavedItems.length} recording(s). You can carry on later; the teacher sees them once you submit.`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("保存录音失败。", "Could not save the recording."));
    } finally {
      setPracticeSavingKey("");
    }
  }

  async function submitPractice() {
    if (!account || !activePractice) return;
    if (practiceActiveKey || practiceProcessingKey) {
      setMessage(tr("请先停止当前录音，再提交。", "Stop the current recording before submitting."));
      return;
    }
    if (Object.keys(practiceRecordings).length) {
      setMessage(tr("还有录音未保存。请先点击“保存已录内容”，再提交。", "Some recordings are unsaved. Save them first, then submit."));
      return;
    }
    if (!activePractice.recordings?.length) {
      setMessage(tr("请先至少保存一段录音后再提交。", "Save at least one recording before submitting."));
      return;
    }

    setPracticeSavingKey("__submit");
    setMessage("");
    try {
      const response = await fetch("/api/student/speaking-practice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceId: activePractice.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("提交失败。", "Submission failed."));
      if (data.practice) {
        setActivePractice(data.practice);
        setSpeakingPractices((current) => upsertPractice(current, data.practice));
      }
      setMessage(tr("已提交给老师。", "Submitted to your teacher."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("提交失败。", "Submission failed."));
    } finally {
      setPracticeSavingKey("");
    }
  }

  function stopPracticeTimer() {
    if (practiceTimerRef.current) window.clearInterval(practiceTimerRef.current);
    practiceTimerRef.current = null;
  }

  // Above the sign-in guard, not below it: on the render where the account is
  // still null this hook never ran, and React counts hooks by position.

  const submissionsByArea = useMemo(() => {
    const speaking: Submission[] = [];
    const writing: Submission[] = [];
    historySubmissions.forEach((submission) => {
      const item = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
      (((item?.assignment_type as AssignmentType) || "speaking") === "writing" ? writing : speaking).push(submission);
    });
    return { speaking, writing };
  }, [historySubmissions]);

  if (!account) {
    return (
      <main className="shell">
        <section className="auth-shell">
          <article className="card stack">
            <div>
              <h1>{t("学生登录", "Student sign-in")}</h1>
              <p className="hint">{t("请使用手机号登录或注册后查看作业。", "Sign in or sign up with your phone number to see your homework.")}</p>
            </div>
            <div className="segmented">
              <button className={`btn ${authMode === "login" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("login")}>
                {t("登录", "Sign in")}
              </button>
              <button className={`btn ${authMode === "register" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("register")}>
                {t("注册", "Sign up")}
              </button>
            </div>
            <div>
              <label>{t("手机号", "Phone number")}</label>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("请输入手机号", "Phone number")} />
            </div>
            {authMode === "register" && (
              <>
                <div>
                  <label>{t("学生姓名", "Your name")}</label>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("请输入学生姓名", "Your name")} />
                </div>
                <div>
                  <label>{t("老师手机号", "Teacher's phone number")}</label>
                  <input value={teacherPhone} onChange={(event) => setTeacherPhone(event.target.value)} placeholder={t("请输入老师手机号", "Teacher's phone number")} />
                  {teacherPhone && <p className="hint">{t("该账号会绑定到对应老师的工作区。", "Your account will be linked to this teacher.")}</p>}
                </div>
              </>
            )}
            <div>
              <label>{t("密码", "Password")}</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("请输入密码", "Password")} />
            </div>
            <button className="btn" disabled={loading || !phone || !password || (authMode === "register" && (!name || !teacherPhone))} onClick={submitAuth} type="button">
              {loading ? t("处理中...", "Working...") : authMode === "login" ? t("登录", "Sign in") : t("创建学生账号", "Create account")}
            </button>
            {message && <p className={message.includes("failed") || message.includes("incorrect") ? "error" : "hint"}>{message}</p>}
          </article>
        </section>
      </main>
    );
  }

  const homeworkRows = getStudentHomeworkRows(assignments, historySubmissions);
  const notificationRows = getStudentHomeworkRows(allAssignments, historySubmissions);
  const notifications = [...announcementNotices(), ...getStudentNotifications(notificationRows)];
  const { latestHomework, historyHomework } = splitStudentHomeworkRows(homeworkRows);
  const practiceCompletedIds = getCompletedPracticeTopicIds(speakingPractices);
  const assignedSpeakingTopicIds = getSpeakingTopicIdsFromAssignments(
    allAssignments.filter((assignment) => (assignment.assignment_type || "speaking") === "speaking")
  );

  const isHomework = activeView === "homework";

  function openHomework(area: AssignmentType) {
    void switchArea(area);
    setActiveView("homework");
  }

  return (
    <main className="shell shell-wide">
      <div className="home-layout">
        {/* The same rail the teacher has. Home, then the two kinds of work,
            then booking; log out at the foot. */}
        <nav className="home-nav" aria-label={t("学生中心", "Student centre")}>
          <button
            className={`home-nav-home ${activeView === "home" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("home")}
          >
            {t("学生主页", "Home")}
          </button>

          <div className="home-nav-group">
            <strong className="home-nav-title">
              <img src={homeworkIcon.src} alt="" />
              {t("作业", "Homework")}
            </strong>
            <button
              className={`home-nav-item ${isHomework && activeArea === "speaking" ? "active" : ""}`}
              type="button"
              onClick={() => openHomework("speaking")}
            >
              {t("口语", "Speaking")}
            </button>
            <button
              className={`home-nav-item ${isHomework && activeArea === "writing" ? "active" : ""}`}
              type="button"
              onClick={() => openHomework("writing")}
            >
              {t("写作", "Writing")}
            </button>
            <button
              className={`home-nav-item ${activeView === "dailyTasks" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveView("dailyTasks")}
            >
              {t("每日任务", "Daily tasks")}
            </button>
          </div>

          <div className="home-nav-group">
            <strong className="home-nav-title">
              <img src={lessonSchedulingIcon.src} alt="" />
              {t("课程预约", "Lessons")}
            </strong>
            <button
              className={`home-nav-item ${activeView === "schedule" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveView("schedule")}
            >
              {t("预约上课", "Book a lesson")}
            </button>
          </div>

          <div className="home-nav-foot">
            <div className="student-nav-me">
              <strong>{account.display_name}</strong>
              <small>{t("学生", "Student")}</small>
            </div>
            <button className="home-nav-logout" onClick={logout} type="button">
              {t("退出登录", "Sign out")}
            </button>
          </div>
        </nav>

        <div className="home-main">
      {activeView === "home" && (
        <StudentHomePanels
          notifications={notifications}
          speakingSubmissions={submissionsByArea.speaking}
          writingSubmissions={submissionsByArea.writing}
          completedP1TopicIds={[...assignedSpeakingTopicIds.p1, ...practiceCompletedIds.p1]}
          completedP2TopicIds={[...assignedSpeakingTopicIds.p2, ...practiceCompletedIds.p2]}
          onPracticeTopic={startSpeakingPractice}
          practiceLoadingId={practiceLoadingId}
          practiceMessage={practiceMessage}
          onOpenSchedule={() => setActiveView("schedule")}
          onOpenDailyTasks={() => setActiveView("dailyTasks")}
        />
      )}

      {activeView === "schedule" && <StudentSchedulePanel account={account} />}
      {activeView === "dailyTasks" && <StudentDailyTasksPanel account={account} />}
      {activeView === "homework" && (
        <div className="student-body">
          <nav className="page-index" aria-label={t("本页目录", "On this page")}>
            <strong>{t("本页内容", "On this page")}</strong>
            <span className="page-index-group">{activeArea === "writing" ? t("写作作业", "Writing") : t("口语作业", "Speaking")}</span>
            <a href="#hw-latest">{t("最新作业", "Latest")}</a>
            {activeArea === "speaking" && activePractice && <a href="#hw-practice">{t("自主练习", "Practice")}</a>}
            <a href="#hw-history">{t("历史作业", "History")}</a>
          </nav>
          <div className="stack">
          <article className="card stack" id="hw-latest">
            <div className="section-head">
              <div>
                <h2>{activeArea === "writing" ? t("写作作业", "Writing homework") : t("口语作业", "Speaking homework")}</h2>
                <div className="hint">{t("打开一项作业即可完成提交或查看反馈。", "Open a homework item to submit or read feedback.")}</div>
              </div>
              <span className="pill">{t(`${assignments.length} 项`, `${assignments.length}`)}</span>
            </div>
            {homeworkRows.length ? (
              <StudentHomeworkGroup title={t("最新作业", "Latest")} assignments={latestHomework} emptyText={t("当前没有需要完成的作业。", "Nothing to do right now.")} />
            ) : (
              <p className="hint">{t("当前板块还没有可查看的作业。", "No homework in this area yet.")}</p>
            )}
            {message && <p className={message.includes("failed") ? "error" : "hint"}>{message}</p>}
          </article>
          {activeArea === "speaking" && activePractice && (
            <div id="hw-practice" ref={practicePanelRef}>
              <SpeakingPracticePanel
                practice={activePractice}
                localRecordings={practiceRecordings}
                activeKey={practiceActiveKey}
                processingKey={practiceProcessingKey}
                savingKey={practiceSavingKey}
                seconds={practiceSeconds}
                onClose={() => {
                  setActivePractice(null);
                  setPracticeMessage("");
                }}
                onSaveAll={saveAllPracticeRecordings}
                onSubmit={submitPractice}
                onToggleRecording={togglePracticeRecording}
              />
            </div>
          )}
          <article className="card stack" id="hw-history">
            <div className="section-head">
              <div>
                <h2>{t("历史作业", "History")}</h2>
                <div className="hint">
                  {activeArea === "writing"
                    ? t("打开作业标题即可查看当时的作文和老师反馈。", "Open a title to see the essay and the teacher's feedback.")
                    : t("打开作业标题即可查看当时的录音和老师反馈。", "Open a title to hear the recordings and read the teacher's feedback.")}
                </div>
              </div>
              <span className="pill">{t(`${historyHomework.length} 项`, `${historyHomework.length}`)}</span>
            </div>
            <StudentHomeworkGroup title="" assignments={historyHomework} emptyText={t("还没有历史作业。", "No past homework yet.")} />
          </article>
          </div>

        </div>
      )}
        </div>
      </div>
    </main>
  );
}

type PracticeQuestionItem = {
  key: string;
  label: string;
  question: string;
};

function SpeakingPracticePanel({
  practice,
  localRecordings,
  activeKey,
  processingKey,
  savingKey,
  seconds,
  onClose,
  onSaveAll,
  onSubmit,
  onToggleRecording
}: {
  practice: SpeakingPracticeSubmission;
  localRecordings: Record<string, LocalPracticeRecording>;
  activeKey: string | null;
  processingKey: string | null;
  savingKey: string;
  seconds: Record<string, number>;
  onClose: () => void;
  onSaveAll: (items: PracticeQuestionItem[]) => void;
  onSubmit: () => void;
  onToggleRecording: (item: PracticeQuestionItem) => void;
}) {
  const items = getPracticeQuestionItems(practice);
  const savedMap = Object.fromEntries((practice.recordings || []).map((recording) => [recording.question_key, recording]));
  const savedCount = items.filter((item) => savedMap[item.key]).length;
  const unsavedCount = Object.keys(localRecordings).length;
  const isComplete = items.length > 0 && savedCount === items.length;
  const isSubmitted = practice.status === "submitted" || practice.status === "reviewed";
  const { t } = useLanguage();

  return (
    <article className="card stack practice-panel">
      <div className="section-head">
        <div>
          <h2>{t("自主口语练习", "Speaking practice")}</h2>
          <div className="hint">
            {practice.practice_type === "p1" ? "Part 1" : "Part 2 + Part 3"} · {practice.topic_title}
          </div>
        </div>
        <button className="btn secondary" type="button" onClick={onClose}>
          {t("返回作业列表", "Back to homework")}
        </button>
      </div>
      <div className="practice-save-bar">
        <div className="stack">
          <div className={`pill ${isComplete ? "ok" : "warn"}`}>
            {t("已保存", "Saved")} {savedCount}/{items.length}
          </div>
          <div className={`pill ${unsavedCount ? "warn" : ""}`}>{t(`${unsavedCount} 条录音待保存`, `${unsavedCount} unsaved`)}</div>
          <div className={`pill ${isSubmitted ? "ok" : "warn"}`}>{isSubmitted ? t("已提交给老师", "Submitted") : t("未提交", "Not submitted")}</div>
        </div>
        <div className="practice-save-actions">
          <button className="btn secondary" disabled={!unsavedCount || Boolean(activeKey || processingKey || savingKey)} type="button" onClick={() => onSaveAll(items)}>
            {savingKey && savingKey !== "__submit" ? t("保存中...", "Saving...") : t("保存已录内容", "Save recordings")}
          </button>
          <button className="btn" disabled={!savedCount || Boolean(activeKey || processingKey || savingKey || unsavedCount)} type="button" onClick={onSubmit}>
            {savingKey === "__submit" ? t("提交中...", "Submitting...") : t("提交给老师", "Submit to teacher")}
          </button>
        </div>
      </div>
      <div className="practice-question-list">
        {items.map((item) => {
          const local = localRecordings[item.key];
          const saved = savedMap[item.key] as SpeakingPracticeRecording | undefined;
          const isActive = activeKey === item.key;
          const isProcessing = processingKey === item.key;
          return (
            <div className="practice-question-card" key={item.key}>
              <div>
                <span className="hint">{item.label}</span>
                <strong>{item.question}</strong>
              </div>
              <div className="record-actions">
                <button className="btn" disabled={Boolean((activeKey && !isActive) || isProcessing || savingKey)} type="button" onClick={() => onToggleRecording(item)}>
                  {isActive ? t("停止录音", "Stop") : isProcessing ? t("处理中...", "Processing...") : local || saved ? t("重新录制", "Record again") : t("开始录音", "Record")}
                </button>
                <span className="timer">{formatSeconds(seconds[item.key] || local?.duration || saved?.duration_seconds || 0)}</span>
              </div>
              {local ? (
                <audio controls src={local.url} />
              ) : saved?.signed_url ? (
                <audio controls src={saved.signed_url} />
              ) : (
                <p className="hint">{t("还没有保存录音。", "No recording saved yet.")}</p>
              )}
              {saved?.teacher_comment && (
                <div className="inline-comment">
                  <strong>{t("老师点评", "Teacher's comment")}</strong>
                  <p>{saved.teacher_comment}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {practice.status === "reviewed" && (
        <div className="overall">
          <strong>{t("老师总评", "Overall comment")}</strong>
          <p>{practice.teacher_comment || t("暂无总评。", "No overall comment.")}</p>
          <div className="topic-progress-summary">
            <span className="pill">Fluency {practice.fluency_score ?? "NA"}</span>
            <span className="pill">Grammar {practice.grammar_score ?? "NA"}</span>
            <span className="pill">Vocabulary {practice.vocabulary_score ?? "NA"}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function getPracticeQuestionItems(practice: SpeakingPracticeSubmission): PracticeQuestionItem[] {
  if (practice.practice_type === "p1") {
    return (practice.p1_questions || []).map((question, index) => ({
      key: `p1-${index + 1}`,
      label: `Part 1 Question ${index + 1}`,
      question
    }));
  }

  return [
    {
      key: "p2",
      label: "Part 2 Cue Card",
      question: practice.p2_prompt
    },
    ...(practice.p3_questions || []).map((question, index) => ({
      key: `p3-${index + 1}`,
      label: `Part 3 Question ${index + 1}`,
      question
    }))
  ].filter((item) => item.question);
}


function StudentHomeworkGroup({
  title,
  assignments,
  emptyText
}: {
  title: string;
  assignments: StudentHomeworkRow[];
  emptyText: string;
}) {
  const { t } = useLanguage();
  return (
    <section className="stack">
      <div className="section-head compact">
        <h3>{title}</h3>
        <span className="pill">{assignments.length}</span>
      </div>
      {assignments.length ? (
        assignments.map((assignment) => (
          <a className="submission-row" href={`/s/${assignment.id}`} key={assignment.id}>
            <span className="homework-history-title-row">
              <strong>{assignment.title}</strong>
              <span className={`pill compact ${studentHomeworkStatusClass(assignment.status)}`}>
                {studentHomeworkStatusLabel(assignment.status)}
              </span>
            </span>
            <span className="hint">{t("创建日期：", "Set on: ")}{formatDate(assignment.created_at)}</span>
            <span className="hint">{t("截止日期：", "Due: ")}{assignmentDateLabel(assignment)}</span>
          </a>
        ))
      ) : (
        <p className="hint">{emptyText}</p>
      )}
    </section>
  );
}

function getStudentHomeworkRows(assignments: StudentAssignmentSummary[], submissions: Submission[]): StudentHomeworkRow[] {
  return assignments.map((assignment) => {
    const submission = submissions.find((item) => item.assignment_id === assignment.id);
    const feedback = Array.isArray(submission?.feedback) ? submission?.feedback[0] : submission?.feedback;
    const status: StudentHomeworkStatus = feedback ? "reviewed" : submission ? "submitted" : "assigned";
    return { ...assignment, status };
  });
}

function splitStudentHomeworkRows(assignments: StudentHomeworkRow[]) {
  const sorted = [...assignments].sort((first, second) => {
    const firstTime = assignmentSortTime(first);
    const secondTime = assignmentSortTime(second);
    return secondTime - firstTime;
  });
  const currentWithDueDate = sorted.filter((assignment) => hasDueDate(assignment) && !isPastDue(assignment));
  const latestHomework = currentWithDueDate.length ? currentWithDueDate : sorted.slice(0, 1);
  const latestIds = new Set(latestHomework.map((assignment) => assignment.id));

  return {
    latestHomework,
    historyHomework: sorted.filter((assignment) => !latestIds.has(assignment.id))
  };
}

// Platform notices go first: they are the rarest thing in the list.
function announcementNotices(): StudentNotification[] {
  return activeAnnouncements().map((notice) => ({
    id: `notice-${notice.id}`,
    title: tr("平台公告", "Notice"),
    message: tr(notice.zh, notice.en),
    href: "#",
    tone: "notice"
  }));
}

function getStudentNotifications(assignments: StudentHomeworkRow[]): StudentNotification[] {
  const notifications: StudentNotification[] = [];
  [...assignments]
    .sort((first, second) => assignmentSortTime(second) - assignmentSortTime(first))
    .forEach((assignment) => {
      const area = assignment.assignment_type === "writing" ? tr("写作", "Writing") : tr("口语", "Speaking");
      if (assignment.status === "assigned") {
        notifications.push({
          id: `assigned-${assignment.id}`,
          title: tr("有新的作业", "New homework"),
          message: tr(`${area} · ${assignment.title} · 截止：${assignmentDateLabel(assignment)}`, `${area} · ${assignment.title} · due ${assignmentDateLabel(assignment)}`),
          href: `/s/${assignment.id}`,
          tone: "assigned"
        });
      }
      if (assignment.status === "reviewed") {
        notifications.push({
          id: `reviewed-${assignment.id}`,
          title: tr("批改已完成", "Feedback published"),
          message: `${area} · ${assignment.title}`,
          href: `/s/${assignment.id}`,
          tone: "reviewed"
        });
      }
    });
  return notifications.slice(0, 4);
}

function assignmentSortTime(assignment: StudentAssignmentSummary) {
  const dateValue = assignment.created_at || assignment.due_date;
  const time = dateValue ? new Date(dateValue).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function hasDueDate(assignment: StudentAssignmentSummary) {
  return Boolean(assignment.due_date && parseDateOnly(assignment.due_date));
}

function isPastDue(assignment: StudentAssignmentSummary) {
  if (!assignment.due_date) return false;
  const dueDate = parseDateOnly(assignment.due_date);
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate.getTime() < today.getTime();
}

function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function studentHomeworkStatusLabel(status: StudentHomeworkStatus) {
  if (status === "reviewed") return tr("已批改", "Marked");
  if (status === "submitted") return tr("已提交", "Submitted");
  return tr("待完成", "To do");
}

// From the student's side the amber belongs on what still needs doing, not on
// what they have already handed in and are waiting to get back.
function studentHomeworkStatusClass(status: StudentHomeworkStatus) {
  if (status === "reviewed") return "ok";
  if (status === "submitted") return "";
  return "warn";
}

function assignmentDateLabel(assignment: Pick<StudentAssignmentSummary, "due_date" | "deadline_text">) {
  return assignment.due_date ? formatDate(assignment.due_date) : assignment.deadline_text || tr("未设置截止日期", "No due date");
}

function formatDate(value?: string | null) {
  if (!value) return tr("暂无日期", "No date");
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly && value.length <= 10) return `${dateOnly[1]}/${dateOnly[2]}/${dateOnly[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN");
}

function upsertPractice(practices: SpeakingPracticeSubmission[], nextPractice: SpeakingPracticeSubmission) {
  const exists = practices.some((practice) => practice.id === nextPractice.id);
  const next = exists ? practices.map((practice) => (practice.id === nextPractice.id ? nextPractice : practice)) : [nextPractice, ...practices];
  return next.sort((first, second) => new Date(second.submitted_at || second.created_at || 0).getTime() - new Date(first.submitted_at || first.created_at || 0).getTime());
}

function getCompletedPracticeTopicIds(practices: SpeakingPracticeSubmission[]) {
  return practices.reduce(
    (completed, practice) => {
      if (practice.status !== "submitted" && practice.status !== "reviewed") return completed;
      if (!practiceHasAllRecordings(practice)) return completed;
      if (practice.practice_type === "p1") completed.p1.push(practice.topic_id);
      if (practice.practice_type === "p2p3") completed.p2.push(practice.topic_id);
      return completed;
    },
    { p1: [] as string[], p2: [] as string[] }
  );
}

function practiceHasAllRecordings(practice: SpeakingPracticeSubmission) {
  const keys = new Set((practice.recordings || []).map((recording) => recording.question_key));
  const items = getPracticeQuestionItems(practice);
  return Boolean(items.length && items.every((item) => keys.has(item.key)));
}

function getSupportedAudioMimeType() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  return options.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
