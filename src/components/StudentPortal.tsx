"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AssignmentType, SpeakingPracticeRecording, SpeakingPracticeSubmission, Submission } from "@/lib/types";
import { StudentSchedulePanel } from "@/components/LessonScheduler";
import { LearningProgressPanel } from "@/components/LearningProgress";
import { SpeakingTopicProgressPanel } from "@/components/SpeakingTopicProgress";
import { StudentDailyTasksPanel } from "@/components/DailyTasks";
import { getSpeakingTopicIdsFromAssignments } from "@/lib/speakingProgress";
import homeworkIcon from "../../public/icons/workspace-homework.png";
import lessonSchedulingIcon from "../../public/icons/workspace-lesson-scheduling.png";
import dailyTasksIcon from "../../public/icons/workspace-daily-tasks.png";
import speakingIcon from "../../public/icons/area-speaking.png";
import writingIcon from "../../public/icons/area-writing.png";

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
  tone: "assigned" | "reviewed";
};

type AssistantSummary = {
  id: string;
  display_name: string;
  phone?: string | null;
};

type LocalPracticeRecording = {
  blob: Blob;
  url: string;
  duration: number;
};

export function StudentPortal() {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [teacherPhone, setTeacherPhone] = useState("");
  const [password, setPassword] = useState("");
  const [activeArea, setActiveArea] = useState<AssignmentType>("speaking");
  const [activeView, setActiveView] = useState<"homework" | "schedule" | "practiceSchedule" | "dailyTasks">("homework");
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[]>([]);
  const [allAssignments, setAllAssignments] = useState<StudentAssignmentSummary[]>([]);
  const [historySubmissions, setHistorySubmissions] = useState<Submission[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [practiceLoadingId, setPracticeLoadingId] = useState("");
  const [practiceMessage, setPracticeMessage] = useState("");
  const [speakingPractices, setSpeakingPractices] = useState<SpeakingPracticeSubmission[]>([]);
  const [assistants, setAssistants] = useState<AssistantSummary[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
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
      await loadAssistants();
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
      if (!response.ok) throw new Error(data.error || "账号操作失败。");
      setAccount(data.account);
      setName(data.account.display_name);
      setPhone(data.account.phone);
      await loadAssignments(data.account.display_name, activeArea);
      await loadHistory(data.account.display_name);
      await loadSpeakingPractices();
      await loadAssistants();
      setMessage("已登录。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "账号操作失败。");
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
    setAssistants([]);
    setSelectedAssistantId("");
    setActivePractice(null);
    setMessage("已退出登录。");
  }

  async function loadAssignments(studentName: string, area: AssignmentType) {
    const response = await fetch(`/api/student/assignments?studentName=${encodeURIComponent(studentName)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "无法加载作业。");
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

  async function loadAssistants() {
    const response = await fetch("/api/student/assistants");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAssistantMessage(data.error || "无法加载助教列表。");
      return;
    }
    const nextAssistants = data.assistants || [];
    setAssistants(nextAssistants);
    setAssistantMessage("");
    setSelectedAssistantId((current) => current || nextAssistants[0]?.id || "");
  }

  async function startSpeakingPractice(part: "p1" | "p2", topicId: string) {
    if (!account) {
      setMessage("请先登录学生账号。");
      return;
    }
    const loadingId = `${part}:${topicId}`;
    setPracticeLoadingId(loadingId);
    setPracticeMessage("正在打开自主练习...");
    setMessage("");
    try {
      const response = await fetch("/api/student/speaking-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicType: part, topicId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "无法打开这个练习。");
      if (!data.practice) throw new Error("自主练习创建成功但没有返回内容，请刷新后重试。");
      setActivePractice(data.practice || null);
      setPracticeRecordings({});
      if (data.practice) {
        setSpeakingPractices((current) => upsertPractice(current, data.practice));
      }
      setPracticeMessage("已打开自主练习。");
      setMessage("已打开自主练习。");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "无法打开这个练习。";
      setPracticeMessage(nextMessage);
      setMessage(nextMessage);
    }
    setPracticeLoadingId("");
  }

  async function togglePracticeRecording(item: PracticeQuestionItem) {
    if (practiceActiveKey) {
      if (practiceActiveKey !== item.key) {
        setMessage("请先停止当前录音，再开始下一题。");
        return;
      }
      practiceRecorderRef.current?.stop();
      stopPracticeTimer();
      setPracticeProcessingKey(item.key);
      setPracticeActiveKey(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("当前浏览器不支持网页录音，请使用 Chrome、Edge 或 Safari。");
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
          setMessage("录音为空，请重新录制这一题。");
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
      setMessage("无法开始录音，请检查麦克风权限。");
      setPracticeActiveKey(null);
      setPracticeProcessingKey(null);
      stopPracticeTimer();
    }
  }

  async function uploadPracticeRecording(item: PracticeQuestionItem) {
    if (!account || !activePractice) return;
    const recording = practiceRecordings[item.key];
    if (!recording) {
      setMessage("请先录制这一题。");
      return;
    }

    const formData = new FormData();
    formData.append("practiceId", activePractice.id);
    formData.append("item", JSON.stringify(item));
    formData.append("duration", String(recording.duration));
    formData.append("audio", recording.blob, `${item.key}.${audioExtension(recording.blob.type)}`);
    const response = await fetch("/api/student/speaking-practice", { method: "PUT", body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "保存录音失败。");
    return data.practice as SpeakingPracticeSubmission | undefined;
  }

  async function saveAllPracticeRecordings(items: PracticeQuestionItem[]) {
    if (!account || !activePractice) return;
    if (practiceActiveKey || practiceProcessingKey) {
      setMessage("请先停止当前录音，再统一保存。");
      return;
    }
    const unsavedItems = items.filter((item) => practiceRecordings[item.key]);
    if (!unsavedItems.length) {
      setMessage("当前没有新录制但未保存的音频。");
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
      setMessage(`已保存 ${unsavedItems.length} 条录音。下次打开仍可继续；点击提交后老师才能看到。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存录音失败。");
    } finally {
      setPracticeSavingKey("");
    }
  }

  async function submitPractice() {
    if (!account || !activePractice) return;
    if (practiceActiveKey || practiceProcessingKey) {
      setMessage("请先停止当前录音，再提交。");
      return;
    }
    if (Object.keys(practiceRecordings).length) {
      setMessage("还有录音未保存。请先点击“保存已录内容”，再提交。");
      return;
    }
    if (!activePractice.recordings?.length) {
      setMessage("请先至少保存一段录音后再提交。");
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
      if (!response.ok) throw new Error(data.error || "提交失败。");
      if (data.practice) {
        setActivePractice(data.practice);
        setSpeakingPractices((current) => upsertPractice(current, data.practice));
      }
      setMessage("已提交给老师。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败。");
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
  const areaSubmissions = useMemo(
    () =>
      historySubmissions.filter((submission) => {
        const item = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
        return ((item?.assignment_type as AssignmentType) || "speaking") === activeArea;
      }),
    [historySubmissions, activeArea]
  );


  if (!account) {
    return (
      <main className="shell">
        <section className="auth-shell">
          <article className="card stack">
            <div>
              <h1>学生登录</h1>
              <p className="hint">请使用手机号登录或注册后查看作业。</p>
            </div>
            <div className="segmented">
              <button className={`btn ${authMode === "login" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("login")}>
                登录
              </button>
              <button className={`btn ${authMode === "register" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("register")}>
                注册
              </button>
            </div>
            <div>
              <label>手机号</label>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="请输入手机号" />
            </div>
            {authMode === "register" && (
              <>
                <div>
                  <label>学生姓名</label>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入学生姓名" />
                </div>
                <div>
                  <label>老师手机号</label>
                  <input value={teacherPhone} onChange={(event) => setTeacherPhone(event.target.value)} placeholder="请输入老师手机号" />
                  {teacherPhone && <p className="hint">该账号会绑定到对应老师的工作区。</p>}
                </div>
              </>
            )}
            <div>
              <label>密码</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" />
            </div>
            <button className="btn" disabled={loading || !phone || !password || (authMode === "register" && (!name || !teacherPhone))} onClick={submitAuth} type="button">
              {loading ? "处理中..." : authMode === "login" ? "登录" : "创建学生账号"}
            </button>
            {message && <p className={message.includes("failed") || message.includes("incorrect") ? "error" : "hint"}>{message}</p>}
          </article>
        </section>
      </main>
    );
  }

  const homeworkRows = getStudentHomeworkRows(assignments, historySubmissions);
  const notificationRows = getStudentHomeworkRows(allAssignments, historySubmissions);
  const notifications = getStudentNotifications(notificationRows);
  const { latestHomework, historyHomework } = splitStudentHomeworkRows(homeworkRows);
  const practiceCompletedIds = getCompletedPracticeTopicIds(speakingPractices);
  const assignedSpeakingTopicIds = getSpeakingTopicIdsFromAssignments(assignments);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>学生中心</h1>
          <p>请选择作业、课程预约或每日打卡。口语和写作作业在作业板块中查看。</p>
          <div className="hero-actions">
            <button className="btn secondary" type="button" onClick={logout}>
              退出登录
            </button>
          </div>
        </div>
      </section>

      <StudentNotificationPanel notifications={notifications} />

      <section className="area-tabs">
        <button className={`area-tab ${activeView === "homework" ? "active" : ""}`} type="button" onClick={() => setActiveView("homework")}>
          <strong className="workspace-title">
            <img src={homeworkIcon.src} alt="" />
            作业
          </strong>
          <span>口语和写作作业</span>
        </button>
        <button className={`area-tab ${activeView === "schedule" ? "active" : ""}`} type="button" onClick={() => setActiveView("schedule")}>
          <strong className="workspace-title">
            <img src={lessonSchedulingIcon.src} alt="" />
            课程预约
          </strong>
          <span>预约上课时间</span>
        </button>
        <button className={`area-tab ${activeView === "practiceSchedule" ? "active" : ""}`} type="button" onClick={() => setActiveView("practiceSchedule")}>
          <strong className="workspace-title">
            <img src={lessonSchedulingIcon.src} alt="" />
            练习课预约
          </strong>
          <span>预约助教练习课</span>
        </button>
        <button className={`area-tab ${activeView === "dailyTasks" ? "active" : ""}`} type="button" onClick={() => setActiveView("dailyTasks")}>
          <strong className="workspace-title">
            <img src={dailyTasksIcon.src} alt="" />
            每日打卡
          </strong>
          <span>查看每日任务</span>
        </button>
      </section>

      {activeView === "schedule" ? (
        <StudentSchedulePanel account={account} />
      ) : activeView === "practiceSchedule" ? (
        <PracticeLessonArea
          account={account}
          assistants={assistants}
          selectedAssistantId={selectedAssistantId}
          assistantMessage={assistantMessage}
          setSelectedAssistantId={setSelectedAssistantId}
          onRefresh={() => loadAssistants()}
        />
      ) : activeView === "dailyTasks" ? (
        <StudentDailyTasksPanel account={account} />
      ) : (
        <div className="student-body">
          <nav className="page-index" aria-label="本页目录">
            <strong>本页内容</strong>
            <span className="page-index-group">{activeArea === "writing" ? "写作作业" : "口语作业"}</span>
            <a className="sub" href="#hw-latest">最新作业</a>
            <a className="sub" href="#hw-history">历史作业</a>
            <a href="#hw-progress">{activeArea === "writing" ? "写作作业情况" : "口语作业情况"}</a>
            {activeArea === "speaking" && (
              <>
                <a href="#hw-topics">过题情况</a>
                {/* Starting one means picking a topic in 过题情况, so before a
                    practice is open this points there; once it is, it points at
                    the panel itself. */}
                <a href={activePractice ? "#hw-practice" : "#hw-topics"}>自主练习</a>
              </>
            )}
          </nav>
          <div className="stack">
          <section className="area-tabs homework-area-tabs">
            <button className={`area-tab homework-area-tab ${activeArea === "speaking" ? "active" : ""}`} type="button" onClick={() => void switchArea("speaking")}>
              <strong className="workspace-title">
                <img src={speakingIcon.src} alt="" />
                口语
              </strong>
              <span>只看口语作业</span>
            </button>
            <button className={`area-tab homework-area-tab ${activeArea === "writing" ? "active" : ""}`} type="button" onClick={() => void switchArea("writing")}>
              <strong className="workspace-title">
                <img src={writingIcon.src} alt="" />
                写作
              </strong>
              <span>只看写作作业</span>
            </button>
          </section>
          <article className="card stack" id="hw-latest">
            <div className="section-head">
              <div>
                <h2>{activeArea === "writing" ? "写作作业" : "口语作业"}</h2>
                <div className="hint">打开一项作业即可完成提交或查看反馈。</div>
              </div>
              <span className="pill">{assignments.length} 项</span>
            </div>
            {homeworkRows.length ? (
              <StudentHomeworkGroup title="最新作业" assignments={latestHomework} emptyText="当前没有需要完成的作业。" />
            ) : (
              <p className="hint">当前板块还没有可查看的作业。</p>
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
          <section id="hw-progress">
            <LearningProgressPanel submissions={areaSubmissions} />
          </section>
          {activeArea === "speaking" && (
            <section id="hw-topics">
              <SpeakingTopicProgressPanel
                submissions={areaSubmissions}
                completedP1TopicIds={[...assignedSpeakingTopicIds.p1, ...practiceCompletedIds.p1]}
                completedP2TopicIds={[...assignedSpeakingTopicIds.p2, ...practiceCompletedIds.p2]}
                onPracticeTopic={startSpeakingPractice}
                practiceLoadingId={practiceLoadingId}
                practiceMessage={practiceMessage}
              />
            </section>
          )}
          <article className="card stack" id="hw-history">
            <div className="section-head">
              <div>
                <h2>历史作业</h2>
                <div className="hint">
                  {activeArea === "writing"
                    ? "打开作业标题即可查看当时的作文和老师反馈。"
                    : "打开作业标题即可查看当时的录音和老师反馈。"}
                </div>
              </div>
              <span className="pill">{historyHomework.length} 项</span>
            </div>
            <StudentHomeworkGroup title="" assignments={historyHomework} emptyText="还没有历史作业。" />
          </article>
          </div>

        </div>
      )}
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

  return (
    <article className="card stack practice-panel">
      <div className="section-head">
        <div>
          <h2>自主口语练习</h2>
          <div className="hint">
            {practice.practice_type === "p1" ? "Part 1" : "Part 2 + Part 3"} · {practice.topic_title}
          </div>
        </div>
        <button className="btn secondary" type="button" onClick={onClose}>
          返回作业列表
        </button>
      </div>
      <div className="practice-save-bar">
        <div className="stack">
          <div className={`pill ${isComplete ? "ok" : "warn"}`}>
            已保存 {savedCount}/{items.length}
          </div>
          <div className={`pill ${unsavedCount ? "warn" : ""}`}>{unsavedCount} 条录音待保存</div>
          <div className={`pill ${isSubmitted ? "ok" : "warn"}`}>{isSubmitted ? "已提交给老师" : "未提交"}</div>
        </div>
        <div className="practice-save-actions">
          <button className="btn secondary" disabled={!unsavedCount || Boolean(activeKey || processingKey || savingKey)} type="button" onClick={() => onSaveAll(items)}>
            {savingKey && savingKey !== "__submit" ? "保存中..." : "保存已录内容"}
          </button>
          <button className="btn" disabled={!savedCount || Boolean(activeKey || processingKey || savingKey || unsavedCount)} type="button" onClick={onSubmit}>
            {savingKey === "__submit" ? "提交中..." : "提交给老师"}
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
                  {isActive ? "停止录音" : isProcessing ? "处理中..." : local || saved ? "重新录制" : "开始录音"}
                </button>
                <span className="timer">{formatSeconds(seconds[item.key] || local?.duration || saved?.duration_seconds || 0)}</span>
              </div>
              {local ? (
                <audio controls src={local.url} />
              ) : saved?.signed_url ? (
                <audio controls src={saved.signed_url} />
              ) : (
                <p className="hint">还没有保存录音。</p>
              )}
              {saved?.teacher_comment && (
                <div className="inline-comment">
                  <strong>老师点评</strong>
                  <p>{saved.teacher_comment}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {practice.status === "reviewed" && (
        <div className="overall">
          <strong>老师总评</strong>
          <p>{practice.teacher_comment || "暂无总评。"}</p>
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

function StudentNotificationPanel({ notifications }: { notifications: StudentNotification[] }) {
  if (!notifications.length) return null;
  const assignedCount = notifications.filter((notification) => notification.tone === "assigned").length;
  const reviewedCount = notifications.filter((notification) => notification.tone === "reviewed").length;

  return (
    <section className="student-notification-card">
      <div className="section-head compact">
        <div>
          <h2>通知提醒</h2>
          <p className="hint">这里会显示新作业和已发布的批改反馈。</p>
        </div>
        <span className="pill">{notifications.length}</span>
      </div>
      <div className="student-notification-summary">
        <span className="pill warn">{assignedCount} 项新作业</span>
        <span className="pill ok">{reviewedCount} 项反馈</span>
      </div>
      <div className="student-notification-list">
        {notifications.map((notification) => (
          <a className={`student-notification-item ${notification.tone}`} href={notification.href} key={notification.id}>
            <strong>{notification.title}</strong>
            <span>{notification.message}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function PracticeLessonArea({
  account,
  assistants,
  selectedAssistantId,
  assistantMessage,
  setSelectedAssistantId,
  onRefresh
}: {
  account: AuthAccount;
  assistants: AssistantSummary[];
  selectedAssistantId: string;
  assistantMessage: string;
  setSelectedAssistantId: (assistantId: string) => void;
  onRefresh: () => void;
}) {
  const selectedAssistant = assistants.find((assistant) => assistant.id === selectedAssistantId) || null;

  return (
    <div className="stack">
      <article className="card stack">
        <div className="section-head">
          <div>
            <h2>选择助教</h2>
            <div className="hint">请选择一位助教后，再查看该助教的练习课空闲时间。</div>
          </div>
          <button className="btn secondary" type="button" onClick={onRefresh}>
            刷新助教
          </button>
        </div>
        {assistantMessage && <p className="hint">{assistantMessage}</p>}
        {assistants.length ? (
          <div className="area-tabs">
            {assistants.map((assistant) => (
              <button
                className={`area-tab ${assistant.id === selectedAssistantId ? "active" : ""}`}
                key={assistant.id}
                type="button"
                onClick={() => setSelectedAssistantId(assistant.id)}
              >
                <strong>{assistant.display_name}</strong>
                <span>{assistant.phone || "暂无手机号"}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="hint">当前老师下面还没有可预约练习课的助教。</p>
        )}
      </article>
      {selectedAssistant && (
        <StudentSchedulePanel
          account={account}
          lessonType="practice"
          assistantId={selectedAssistant.id}
          title={`${selectedAssistant.display_name} 的练习课预约`}
          hint="绿色时间段是该助教可预约练习课。每节练习课 1 小时，预约后等待助教确认。"
        />
      )}
    </div>
  );
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
            <span className="hint">创建日期：{formatDate(assignment.created_at)}</span>
            <span className="hint">截止日期：{assignmentDateLabel(assignment)}</span>
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

function getStudentNotifications(assignments: StudentHomeworkRow[]): StudentNotification[] {
  const notifications: StudentNotification[] = [];
  [...assignments]
    .sort((first, second) => assignmentSortTime(second) - assignmentSortTime(first))
    .forEach((assignment) => {
      const area = assignment.assignment_type === "writing" ? "写作" : "口语";
      if (assignment.status === "assigned") {
        notifications.push({
          id: `assigned-${assignment.id}`,
          title: "有新的作业",
          message: `${area} · ${assignment.title} · 截止：${assignmentDateLabel(assignment)}`,
          href: `/s/${assignment.id}`,
          tone: "assigned"
        });
      }
      if (assignment.status === "reviewed") {
        notifications.push({
          id: `reviewed-${assignment.id}`,
          title: "批改已完成",
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
  if (status === "reviewed") return "已批改";
  if (status === "submitted") return "已提交";
  return "待完成";
}

function studentHomeworkStatusClass(status: StudentHomeworkStatus) {
  if (status === "reviewed") return "ok";
  if (status === "submitted") return "warn";
  return "";
}

function assignmentDateLabel(assignment: Pick<StudentAssignmentSummary, "due_date" | "deadline_text">) {
  return assignment.due_date ? formatDate(assignment.due_date) : assignment.deadline_text || "未设置截止日期";
}

function formatDate(value?: string | null) {
  if (!value) return "暂无日期";
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
