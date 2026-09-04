"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Assignment, AssignmentType, Feedback, FeedbackDetail, LessonRecord, QuestionItem, Recording, SpeakingPracticeSubmission, StudentProfile, Submission, WritingResponse, WritingTask } from "@/lib/types";
import { mergeFeedbackDetails, questionCommentDetails, scoreDetails } from "@/lib/feedback";
import { p1QuestionBank, p2P3QuestionBank } from "@/lib/questionBank";
import { averageScore, defaultAssignment, defaultWritingAssignment, getQuestionItems } from "@/lib/questions";
import { LearningProgressPanel } from "@/components/LearningProgress";
import { TeacherSchedulePanel } from "@/components/LessonScheduler";
import { SpeakingTopicProgressPanel } from "@/components/SpeakingTopicProgress";
import { TeacherDailyTasksPanel } from "@/components/DailyTasks";
import { TranscriptDiff } from "@/components/TranscriptDiff";
import { TrackedTextEditor } from "@/components/TrackedTextEditor";
import { getSpeakingTopicIdsFromAssignments } from "@/lib/speakingProgress";
import { newInlineCommentId, parseReviewComment, stringifyReviewComment, type InlineComment, type ReviewComment } from "@/lib/reviewComments";
import homeworkIcon from "../../public/icons/workspace-homework.png";
import lessonSchedulingIcon from "../../public/icons/workspace-lesson-scheduling.png";
import dailyTasksIcon from "../../public/icons/workspace-daily-tasks.png";
import teacherSpeakingIcon from "../../public/icons/speaking_teacher.png";
import teacherWritingIcon from "../../public/icons/writing_teacher.png";

type DraftAssignment = Omit<Assignment, "updated_at">;
type AuthAccount = {
  id: string;
  role: "teacher" | "student";
  phone: string;
  display_name: string;
  /** Null while a teacher is waiting for the operator to send their code. */
  activated_at?: string | null;
};
type SubmissionAssignmentWithQuestions = {
  id: string;
  assignment_type?: AssignmentType;
  title: string;
  deadline_text: string;
  due_date?: string | null;
  p1_questions?: string[];
  p2_prompt?: string;
  p3_questions?: string[];
  writing_tasks?: WritingTask[];
};
type StudentTopicHistory = {
  p1: string[];
  p2: string[];
  writing: string[];
};
type TeacherLanguage = "zh" | "en";

export function TeacherDashboard() {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authPhone, setAuthPhone] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [activeArea, setActiveArea] = useState<AssignmentType>("speaking");
  const [teacherSection, setTeacherSection] = useState<"students" | "assignments" | "grading" | "schedule" | "lessonRecording" | "dailyTasks">("students");
  const [navLevel, setNavLevel] = useState<"root" | "area" | "section" | "detail">("root");
  const [dailyTaskMode, setDailyTaskMode] = useState<"assign" | "progress">("assign");
  const [assignmentView, setAssignmentView] = useState<"history" | "new">("history");
  const [gradingMode, setGradingMode] = useState<"assignment" | "student">("assignment");
  const [gradingStudentName, setGradingStudentName] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<DraftAssignment>(() => ({ id: "", ...defaultAssignment }));
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [areaSubmissions, setAreaSubmissions] = useState<Submission[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState<Feedback | null>(null);
  const [gradingDetailOpen, setGradingDetailOpen] = useState(false);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [selectedStudentName, setSelectedStudentName] = useState("");
  const [studentProgress, setStudentProgress] = useState<Submission[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [transcribingId, setTranscribingId] = useState("");
  const [savingTranscriptId, setSavingTranscriptId] = useState("");
  const [savingWritingId, setSavingWritingId] = useState("");
  const [uploadingDemoId, setUploadingDemoId] = useState("");
  const [teacherLanguage, setTeacherLanguage] = useState<TeacherLanguage>("zh");
  const [activationCode, setActivationCode] = useState("");
  const [activating, setActivating] = useState(false);

  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId);
  const isWritingGradingDetail = activeArea === "writing" && gradingDetailOpen && Boolean(selectedSubmission);
  const areaAssignments = assignments.filter((assignment) => assignmentArea(assignment) === activeArea);
  // A registered but unactivated teacher gets the activation form, not an
  // empty workspace that fails on every request.
  const awaitingActivation = Boolean(account) && !account?.activated_at;
  const hasTeacherAccess = Boolean(account) && !awaitingActivation;
  const studentLink = useMemo(() => {
    if (!draft.id || typeof window === "undefined") return "";
    return `${window.location.origin}/s/${draft.id}`;
  }, [draft.id]);
  const studentInviteLink = useMemo(() => {
    if (!account?.phone || typeof window === "undefined") return "";
    return `${window.location.origin}/student?teacherPhone=${encodeURIComponent(account.phone)}`;
  }, [account?.phone]);

  useEffect(() => {
    const savedLanguage = typeof window !== "undefined" ? window.localStorage.getItem("teacherLanguage") : "";
    if (savedLanguage === "zh" || savedLanguage === "en") setTeacherLanguage(savedLanguage);
    void loadCurrentAccount();
  }, []);

  function toggleTeacherLanguage() {
    setTeacherLanguage((current) => {
      const next = current === "zh" ? "en" : "zh";
      if (typeof window !== "undefined") window.localStorage.setItem("teacherLanguage", next);
      return next;
    });
  }

  function t(zh: string, en: string) {
    return teacherLanguage === "zh" ? zh : en;
  }

  async function api(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init.headers || {}) as Record<string, string>)
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, {
      ...init,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败。");
    return data;
  }

  async function loadAssignments() {
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/teacher/assignments");
      const studentsData = await api(`/api/teacher/students?assignmentType=${activeArea}`);
      const submissionsData = await api(`/api/teacher/submissions?assignmentType=${activeArea}`);
      const loaded = data.assignments || [];
      setStudents(studentsData.students || []);
      setAssignments(loaded);
      setAreaSubmissions(submissionsData.submissions || []);
      const visible = loaded.filter((assignment: Assignment) => assignmentArea(assignment) === activeArea);
      if (visible[0]) {
        setSelectedId(visible[0].id);
        setDraft(visible[0]);
        await loadSubmissions(visible[0].id);
      } else {
        startNewAssignment();
      }
      setMessage("工作台已加载。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败。");
    } finally {
      setLoading(false);
    }
  }

  async function loadSubmissions(assignmentId = selectedId) {
    if (!assignmentId) return;
    const data = await api(`/api/teacher/submissions?assignmentId=${assignmentId}&assignmentType=${activeArea}`);
    const loaded = data.submissions || [];
    const first = loaded[0];
    setSubmissions(loaded);
    setSelectedSubmissionId(first?.id || "");
    setFeedbackDraft(first ? feedbackForSubmission(first) : null);
    setGradingDetailOpen(false);
    if (first?.student_name) {
      await loadStudentProgress(first.student_name);
    } else {
      setStudentProgress([]);
    }
  }

  async function loadStudentProgress(studentName: string, area = activeArea) {
    setSelectedStudentName(studentName);
    setStudentProgress([]);
    try {
      const data = await api(`/api/teacher/submissions?studentName=${encodeURIComponent(studentName)}&assignmentType=${area}`);
      setStudentProgress(
        (data.submissions || []).filter((submission: Submission) => {
          const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
          return (assignment?.assignment_type || "speaking") === area;
        })
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "学生情况加载失败。");
    }
  }

  async function loadAreaSubmissions(area = activeArea) {
    const data = await api(`/api/teacher/submissions?assignmentType=${area}`);
    setAreaSubmissions(data.submissions || []);
  }

  async function loadCurrentAccount() {
    const response = await fetch("/api/auth/me");
    const data = await response.json().catch(() => ({}));
    if (data.account?.role === "teacher") {
      setAccount(data.account);
      // Every teacher route 403s until the code is entered, so skip the fetch.
      if (data.account.activated_at) await loadAssignments();
    }
  }

  async function loadStudentsForArea(area: AssignmentType) {
    const data = await api(`/api/teacher/students?assignmentType=${area}`);
    setStudents(data.students || []);
  }

  async function submitAuth() {
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "teacher",
          phone: authPhone,
          displayName: authName || "老师",
          password: authPassword
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "账号请求失败。");
      setAccount(data.account);
      setToken("");
      setMessage("老师账号已准备好。");
      await loadAssignments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "账号请求失败。");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setAccount(null);
    setToken("");
    setAssignments([]);
    setSubmissions([]);
    setSelectedId("");
    setSelectedSubmissionId("");
    setFeedbackDraft(null);
    setMessage("已退出登录。");
  }

  function selectAssignment(id: string) {
    const assignment = assignments.find((item) => item.id === id);
    setSelectedId(id);
    setGradingDetailOpen(false);
    if (assignment) {
      setDraft(assignment);
      void loadSubmissions(id);
      setStudentProgress([]);
    }
  }

  function startNewAssignment() {
    setSelectedId("");
    setDraft({ id: "", ...(activeArea === "writing" ? defaultWritingAssignment : defaultAssignment) });
    setSubmissions([]);
    setSelectedSubmissionId("");
    setFeedbackDraft(null);
    setGradingDetailOpen(false);
    setStudentProgress([]);
  }

  async function saveAssignment(asNew = false) {
    setMessage("");
    try {
      const payload = {
        ...draft,
        assignment_type: activeArea,
        due_date: draft.due_date || null,
        deadline_text: draft.due_date || draft.deadline_text,
        p1_questions: draft.p1_questions.map((question) => question.trim()).filter(Boolean),
        p3_questions: draft.p3_questions.map((question) => question.trim()).filter(Boolean),
        writing_tasks: (draft.writing_tasks || [])
          .filter(
            (task) =>
              task.title.trim() &&
              (task.prompt.trim() || (task.image_urls || []).length || task.task1_type?.trim() || task.task2_type?.trim() || task.topic?.trim())
          )
          .map((task, index) => ({
            ...task,
            key: task.key || `writing_task_${index + 1}`,
            label: task.label || (task.key === "writing_task_2" ? "Writing Task 2" : "Writing Task 1"),
            title: task.title.trim(),
            prompt: task.prompt.trim(),
            word_limit: task.word_limit || "",
            task1_type: task.task1_type || "",
            task2_type: task.task2_type || "",
            topic: task.topic || "",
            image_urls: task.image_urls || []
          })),
        assigned_students: cleanStudentNames(draft.assigned_students || [])
      };
      if (asNew || !payload.id) delete (payload as Partial<DraftAssignment>).id;
      const data = await api("/api/teacher/assignments", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setDraft(data.assignment);
      setSelectedId(data.assignment.id);
      await loadAssignments();
      await loadAreaSubmissions(activeArea);
      setMessage(asNew ? "新作业已保存。" : "作业已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    }
  }

  async function analyzeSubmission() {
    if (!selectedSubmissionId) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/teacher/analyze", {
        method: "POST",
        body: JSON.stringify({ submissionId: selectedSubmissionId })
      });
      setFeedbackDraft(data.feedback);
      await loadSubmissions();
      if (selectedSubmission?.student_name) await loadStudentProgress(selectedSubmission.student_name);
      setMessage("AI 反馈草稿已生成。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 分析失败。");
    } finally {
      setLoading(false);
    }
  }

  async function publishFeedback() {
    if (!feedbackDraft || !selectedSubmissionId) return;
    setMessage("");
    try {
      const data = await api("/api/teacher/publish-feedback", {
        method: "POST",
        body: JSON.stringify({
          submissionId: selectedSubmissionId,
          overallComment: feedbackDraft.overall_comment,
          details: feedbackDraft.details
        })
      });
      setFeedbackDraft(data.feedback);
      if (gradingMode === "student") {
        await loadSubmissionsByStudent(gradingStudentName || selectedSubmission?.student_name || selectedStudentName);
      } else {
        await loadSubmissions();
      }
      if (selectedSubmission?.student_name) await loadStudentProgress(selectedSubmission.student_name);
      await loadStudentsForArea(activeArea);
      await loadAreaSubmissions(activeArea);
      setMessage("批改已发布。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布失败。");
    }
  }

  async function deleteSubmission() {
    if (!selectedSubmission) return;
    const confirmed = window.confirm(`确定删除 ${selectedSubmission.student_name} 的提交和全部录音吗？`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      await api(`/api/teacher/submissions?submissionId=${selectedSubmission.id}`, {
        method: "DELETE"
      });
      if (gradingMode === "student") {
        await loadSubmissionsByStudent(gradingStudentName || selectedSubmission.student_name || selectedStudentName);
      } else {
        await loadSubmissions();
      }
      await loadStudentsForArea(activeArea);
      await loadAreaSubmissions(activeArea);
      setMessage("提交已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAssignment(assignment: Assignment) {
    const stats = assignmentStats(assignment.id);
    const confirmed = window.confirm(
      stats.submitted
        ? `确定从作业列表隐藏“${assignment.title}”吗？已有的 ${stats.submitted} 份学生提交会保留。`
        : `确定从作业列表隐藏“${assignment.title}”吗？`
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      await api(`/api/teacher/assignments?assignmentId=${assignment.id}`, {
        method: "DELETE"
      });
      await loadAssignments();
      await loadAreaSubmissions(activeArea);
      setMessage("作业已从发布列表隐藏。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除作业失败。");
    } finally {
      setLoading(false);
    }
  }

  function switchArea(area: AssignmentType) {
    setActiveArea(area);
    setGradingDetailOpen(false);
    void loadStudentsForArea(area);
    void loadAreaSubmissions(area);
    const first = assignments.find((assignment) => assignmentArea(assignment) === area);
    if (first) {
      setSelectedId(first.id);
      setDraft(first);
      void loadSubmissionsForArea(first.id, area);
    } else {
      setSelectedId("");
      setDraft({ id: "", ...(area === "writing" ? defaultWritingAssignment : defaultAssignment) });
      setSubmissions([]);
      setSelectedSubmissionId("");
      setFeedbackDraft(null);
    }
    if (selectedStudentName) void loadStudentProgress(selectedStudentName, area);
  }

  function openArea(area: AssignmentType) {
    switchArea(area);
    setNavLevel("section");
  }

  async function activateAccount() {
    if (!activationCode.trim()) return;
    setActivating(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: activationCode.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "激活失败。");
      setActivationCode("");
      // Re-read the session so activated_at is present and the workspace opens.
      await loadCurrentAccount();
      setMessage("激活成功，可以开始使用了。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "激活失败。");
    } finally {
      setActivating(false);
    }
  }

  function openSection(section: "students" | "assignments" | "grading") {
    setTeacherSection(section);
    setNavLevel("detail");
  }

  function openSchedule() {
    setTeacherSection("schedule");
    setNavLevel("detail");
  }

  function openLessonRecording() {
    setTeacherSection("lessonRecording");
    setNavLevel("detail");
  }

  function openDailyTasks(mode: "assign" | "progress" = "assign") {
    setDailyTaskMode(mode);
    setTeacherSection("dailyTasks");
    setNavLevel("detail");
  }

  async function loadSubmissionsForArea(assignmentId: string, area: AssignmentType) {
    if (!assignmentId) return;
    const data = await api(`/api/teacher/submissions?assignmentId=${assignmentId}&assignmentType=${area}`);
    const loaded = data.submissions || [];
    const first = loaded[0];
    setSubmissions(loaded);
    setSelectedSubmissionId(first?.id || "");
    setFeedbackDraft(first ? feedbackForSubmission(first) : null);
    setGradingDetailOpen(false);
  }

  async function loadSubmissionsByStudent(studentName: string, area = activeArea) {
    const name = studentName.trim();
    if (!name) return;
    const data = await api(`/api/teacher/submissions?studentName=${encodeURIComponent(name)}&assignmentType=${area}`);
    const loaded = data.submissions || [];
    const first = loaded[0];
    setGradingStudentName(name);
    setSelectedStudentName(name);
    setStudentProgress(loaded);
    setSubmissions(loaded);
    setSelectedSubmissionId(first?.id || "");
    setSelectedId(first?.assignment_id || "");
    setFeedbackDraft(first ? feedbackForSubmission(first) : null);
    setGradingDetailOpen(false);
  }

  function refreshGradingSubmissions() {
    if (gradingMode === "student") {
      void loadSubmissionsByStudent(gradingStudentName || selectedStudentName);
      return;
    }
    void loadSubmissions();
  }

  function assignHomeworkToStudent(studentName: string) {
    prepareHomeworkForStudent(studentName);
    setTeacherSection("assignments");
    setNavLevel("detail");
    setAssignmentView("new");
  }

  function prepareHomeworkForStudent(studentName: string) {
    setDraft({
      id: "",
      ...(activeArea === "writing" ? defaultWritingAssignment : defaultAssignment),
      assigned_students: [studentName]
    });
    setSelectedId("");
    setSubmissions([]);
    setSelectedSubmissionId("");
    setFeedbackDraft(null);
    setMessage(`已为 ${studentName} 开始创建新的${activeArea === "writing" ? "写作" : "口语"}作业。`);
  }

  async function transcribeRecording(recordingId: string) {
    setTranscribingId(recordingId);
    setMessage("");
    try {
      const data = await api("/api/teacher/transcribe", {
        method: "POST",
        body: JSON.stringify({ recordingId })
      });
      patchRecording(recordingId, data.recording || {});
      setMessage("转写已生成。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "转写失败。");
    } finally {
      setTranscribingId("");
    }
  }

  async function saveCorrectedTranscript(recordingId: string, correctedTranscript: string) {
    setSavingTranscriptId(recordingId);
    setMessage("");
    try {
      const data = await api("/api/teacher/transcribe", {
        method: "PATCH",
        body: JSON.stringify({ recordingId, correctedTranscript })
      });
      patchRecording(recordingId, data.recording || {});
      setMessage("转写修改已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存转写失败。");
    } finally {
      setSavingTranscriptId("");
    }
  }

  function updateTranscriptDraft(recordingId: string, corrected_transcript_text: string) {
    patchRecording(recordingId, { corrected_transcript_text });
  }

  async function uploadTeacherDemo(recordingId: string, file?: File, duration = 0) {
    if (!file) return;
    setUploadingDemoId(recordingId);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("recordingId", recordingId);
      formData.append("audio", file, file.name);
      formData.append("duration", String(duration));

      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch("/api/teacher/demo-recording", {
        method: "POST",
        headers,
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "示范回答保存失败。");

      patchRecording(recordingId, { teacher_demo: data.demo || null });
      setMessage("示范回答已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "示范回答保存失败。");
    } finally {
      setUploadingDemoId("");
    }
  }

  function patchRecording(recordingId: string, patch: Partial<Recording>) {
    const patchSubmission = (submission: Submission) => ({
      ...submission,
      recordings: (submission.recordings || []).map((recording) =>
        recording.id === recordingId ? { ...recording, ...patch } : recording
      )
    });

    setSubmissions((current) => current.map(patchSubmission));
    setStudentProgress((current) => current.map(patchSubmission));
  }

  async function saveWritingRevision(responseId: string, teacherRevisionText: string) {
    setSavingWritingId(responseId);
    setMessage("");
    try {
      const data = await api("/api/teacher/writing", {
        method: "PATCH",
        body: JSON.stringify({ responseId, teacherRevisionText })
      });
      patchWritingResponse(responseId, data.writingResponse || {});
      setMessage("作文修改已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作文修改保存失败。");
    } finally {
      setSavingWritingId("");
    }
  }

  function updateWritingRevisionDraft(responseId: string, teacher_revision_text: string) {
    patchWritingResponse(responseId, { teacher_revision_text });
  }

  function patchWritingResponse(responseId: string, patch: Partial<WritingResponse>) {
    const patchSubmission = (submission: Submission) => ({
      ...submission,
      writing_responses: (submission.writing_responses || []).map((response) =>
        response.id === responseId ? { ...response, ...patch } : response
      )
    });

    setSubmissions((current) => current.map(patchSubmission));
    setStudentProgress((current) => current.map(patchSubmission));
  }

  function selectSubmission(id: string) {
    const submission = submissions.find((item) => item.id === id);
    setSelectedSubmissionId(id);
    setFeedbackDraft(submission ? feedbackForSubmission(submission) : null);
    setGradingDetailOpen(activeArea === "writing");
    if (submission?.assignment_id) setSelectedId(submission.assignment_id);
    if (submission?.student_name) void loadStudentProgress(submission.student_name);
  }

  function updateDetail(index: number, patch: Partial<FeedbackDetail>) {
    const base = feedbackDraft || (selectedSubmission ? createManualFeedback(selectedSubmission) : null);
    if (!base || index < 0) return;
    const details = base.details.map((detail, detailIndex) =>
      detailIndex === index ? { ...detail, ...patch } : detail
    );
    setFeedbackDraft({
      ...base,
      details,
      overall_score: averageScore(scoreDetails(details))
    });
  }

  function assignmentStats(assignmentId: string) {
    const rows = areaSubmissions.filter((submission) => submission.assignment_id === assignmentId);
    return {
      submitted: rows.length,
      reviewed: rows.filter(hasPublishedFeedback).length
    };
  }

  function editAssignment(id: string) {
    selectAssignment(id);
    setAssignmentView("new");
  }

  function openStudentHomework(assignment: Assignment, submission?: Submission) {
    if (submission) {
      setTeacherSection("grading");
      setNavLevel("detail");
      setGradingMode("student");
      setGradingStudentName(submission.student_name);
      setSubmissions(studentProgress);
      setSelectedSubmissionId(submission.id);
      setSelectedId(submission.assignment_id);
      setFeedbackDraft(feedbackForSubmission(submission));
      setGradingDetailOpen(assignmentArea(assignment) === "writing");
      return;
    }

    setTeacherSection("assignments");
    setNavLevel("detail");
    setAssignmentView("new");
    setSelectedId(assignment.id);
    setDraft(assignment);
    void loadSubmissionsForArea(assignment.id, assignmentArea(assignment));
  }

  // A registered but unactivated teacher gets this screen and nothing else.
  // Returning early rather than hiding sections means no workspace markup, and
  // no data left from a previous session, can appear behind it.
  if (awaitingActivation) {
    return (
      <main className="shell">
        <section className="activation-screen">
          <div className="activation-card">
            <h1>{t("账号待激活", "Account not activated")}</h1>
            <p className="hint">
              {t(
                "账号已注册。请向管理员索取授权码，输入后即可开始使用。授权码与你的手机号绑定，只能激活这一个账号。",
                "Your account is registered. Ask the administrator for your activation code. It is tied to your phone number and activates only this account."
              )}
            </p>
            <div className="activation-account">
              <span className="muted">{t("当前账号", "Account")}</span>
              <strong>
                {account?.display_name} · {account?.phone}
              </strong>
            </div>
            <div>
              <label>{t("授权码", "Activation code")}</label>
              <input
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void activateAccount();
                }}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="off"
                autoFocus
              />
            </div>
            {message && <p className={message.includes("成功") ? "hint" : "error"}>{message}</p>}
            <button className="btn" disabled={activating || !activationCode.trim()} onClick={activateAccount} type="button">
              {activating ? t("激活中...", "Activating...") : t("激活账号", "Activate")}
            </button>
            <button className="btn secondary" onClick={logout} type="button">
              {t("退出登录", "Log out")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!hasTeacherAccess) {
    return (
      <main className="shell">
        <section className="auth-shell">
          <article className="card stack">
            <div>
              <h1>{t("老师登录", "Teacher login")}</h1>
              <p className="hint">
                {t("用手机号登录。新账号需要授权码才能开通。", "Log in with your phone number. A new account opens with an activation code.")}
              </p>
            </div>
            <div className="segmented">
              <button className={`btn ${authMode === "login" ? "" : "secondary"}`} onClick={() => setAuthMode("login")} type="button">
                {t("登录", "Log in")}
              </button>
              <button className={`btn ${authMode === "register" ? "" : "secondary"}`} onClick={() => setAuthMode("register")} type="button">
                {t("注册", "Register")}
              </button>
            </div>
            <div>
              <label>{t("手机号", "Phone number")}</label>
              <input value={authPhone} onChange={(event) => setAuthPhone(event.target.value)} placeholder="+1..." />
            </div>
            {authMode === "register" && (
              <div>
                <label>{t("老师姓名", "Teacher name")}</label>
                <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder={t("老师姓名", "Teacher name")} />
              </div>
            )}
            <div>
              <label>{t("密码", "Password")}</label>
              <input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder={t("至少 6 位字符", "At least 6 characters")} />
            </div>
            <button className="btn" onClick={submitAuth} disabled={loading || !authPhone || !authPassword} type="button">
              {loading ? t("处理中...", "Processing...") : authMode === "login" ? t("登录", "Log in") : t("创建老师账号", "Create teacher account")}
            </button>
            {message && <p className={message.includes("failed") || message.includes("Unauthorized") ? "error" : "hint"}>{message}</p>}
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>{t("老师工作台", "Teacher dashboard")}</h1>
          <p>{t("管理学生档案、布置作业、批改提交内容并发布反馈。", "Manage student profiles, assign homework, review submissions, and publish feedback.")}</p>
          <div className="bank-actions hero-actions">
              <button className="btn secondary" onClick={toggleTeacherLanguage} type="button">
                {teacherLanguage === "zh" ? "English" : "中文"}
              </button>
              <button className="btn secondary" onClick={loadAssignments} disabled={loading} type="button">
                {loading ? t("加载中...", "Loading...") : t("刷新", "Refresh")}
              </button>
              {account && (
                <button className="btn secondary" onClick={logout} type="button">
                  {t("退出登录", "Log out")}
                </button>
              )}
          </div>
        </div>
      </section>
      {hasTeacherAccess && message && (
        <p className={message.includes("failed") || message.includes("Unauthorized") ? "error" : "hint"}>{message}</p>
      )}

      {hasTeacherAccess && navLevel === "root" && (
        <section className="single-column">
          <article className="card stack">
            <div>
              <h2>{t("选择工作区", "Choose workspace")}</h2>
              <p className="hint">{t("作业、上课记录和每日任务是三个独立工作区。", "Homework, lesson records, and daily tasks are separate workspaces.")}</p>
            </div>
            {studentInviteLink && (
              <div className="question-card">
                <label>{t("学生自助注册链接", "Student self-registration link")}</label>
                <input value={studentInviteLink} readOnly />
                <button className="btn secondary" type="button" onClick={() => navigator.clipboard.writeText(studentInviteLink)}>
                  {t("复制链接", "Copy link")}
                </button>
              </div>
            )}
            <UsagePanel language={teacherLanguage} />
            <div className="area-tabs">
              <div className="area-tab homework-workspace-card">
                <strong className="workspace-title">
                  <img src={homeworkIcon.src} alt="" />
                  {t("作业", "Homework")}
                </strong>
                <span>{t("口语和写作作业", "Speaking and writing homework")}</span>
                <div className="homework-workspace-actions">
                  <button className="homework-subtab" type="button" onClick={() => openArea("speaking")}>
                    <img src={teacherSpeakingIcon.src} alt="" />
                    {t("口语", "Speaking")}
                  </button>
                  <button className="homework-subtab" type="button" onClick={() => openArea("writing")}>
                    <img src={teacherWritingIcon.src} alt="" />
                    {t("写作", "Writing")}
                  </button>
                </div>
              </div>
              <div className="area-tab homework-workspace-card">
                <strong className="workspace-title">
                  <img src={lessonSchedulingIcon.src} alt="" />
                  {t("上课记录", "Lesson records")}
                </strong>
                <span>{t("排课、课堂记录和课程备注", "Scheduling, lesson records, and class notes")}</span>
                <div className="homework-workspace-actions">
                  <button className="homework-subtab" type="button" onClick={openSchedule}>
                    {t("排课", "Schedule")}
                  </button>
                  <button className="homework-subtab" type="button" onClick={openLessonRecording}>
                    {t("记录", "Records")}
                  </button>
                </div>
              </div>
              <div className="area-tab homework-workspace-card">
                <strong className="workspace-title">
                  <img src={dailyTasksIcon.src} alt="" />
                  {t("每日任务", "Daily tasks")}
                </strong>
                <span>{t("每日学习计划和学生打卡", "Daily study plans and student check-ins")}</span>
                <div className="homework-workspace-actions">
                  <button className="homework-subtab" type="button" onClick={() => openDailyTasks("assign")}>
                    {t("布置", "Assign")}
                  </button>
                  <button className="homework-subtab" type="button" onClick={() => openDailyTasks("progress")}>
                    {t("完成情况", "Progress")}
                  </button>
                </div>
              </div>
            </div>
          </article>
        </section>
      )}

      {hasTeacherAccess && navLevel === "area" && (
        <section className="single-column">
          <div className="crumb-bar">
            <button className="btn secondary" type="button" onClick={() => setNavLevel("root")}>
              {t("返回", "Back")}
            </button>
            <span className="pill">{t("作业", "Homework")}</span>
          </div>
          <article className="card stack">
            <div>
              <h2>{t("选择作业板块", "Choose homework area")}</h2>
              <p className="hint">{t("请先选择口语或写作，再进入学生档案、作业布置或作业批改。", "Choose Speaking or Writing first, then open student profiles, publishing, or grading.")}</p>
            </div>
            <div className="area-tabs">
              <button className="area-tab" type="button" onClick={() => openArea("speaking")}>
                <strong className="workspace-title">
                  <img src={teacherSpeakingIcon.src} alt="" />
                  {t("口语", "Speaking")}
                </strong>
                <span>{t("口语作业", "Speaking homework")}</span>
              </button>
              <button className="area-tab" type="button" onClick={() => openArea("writing")}>
                <strong className="workspace-title">
                  <img src={teacherWritingIcon.src} alt="" />
                  {t("写作", "Writing")}
                </strong>
                <span>{t("写作作业", "Writing homework")}</span>
              </button>
            </div>
          </article>
        </section>
      )}

      {hasTeacherAccess && navLevel === "section" && (
        <section className="single-column">
          <div className="crumb-bar">
            <button className="btn secondary" type="button" onClick={() => setNavLevel("root")}>
              {t("返回", "Back")}
            </button>
            <span className="pill">{t("作业", "Homework")}</span>
            <span className="pill ok">{activeArea === "writing" ? t("写作", "Writing") : t("口语", "Speaking")}</span>
          </div>
          <article className="card stack">
            <div>
              <h2>{activeArea === "writing" ? t("写作工作区", "Writing workspace") : t("口语工作区", "Speaking workspace")}</h2>
              <p className="hint">{t("请选择一个模块继续。", "Choose a module to continue.")}</p>
            </div>
            <div className="area-tabs">
              <button className="area-tab" type="button" onClick={() => openSection("students")}>
                <strong>{t("学生情况", "Student profiles")}</strong>
                <span>{t("学生档案、完成情况和分数变化", "Student profiles, completion status, and score trends")}</span>
              </button>
              <button className="area-tab" type="button" onClick={() => openSection("assignments")}>
                <strong>{t("作业布置", "Homework publishing")}</strong>
                <span>{t("历史发布作业和发布新作业", "Published homework history and new homework")}</span>
              </button>
              <button className="area-tab" type="button" onClick={() => openSection("grading")}>
                <strong>{t("作业批改", "Homework grading")}</strong>
                <span>{t("学生提交、修改、评分和反馈", "Student submissions, edits, scores, and feedback")}</span>
              </button>
            </div>
          </article>
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && (
        <div className="crumb-bar">
          {teacherSection === "schedule" || teacherSection === "lessonRecording" ? (
            <>
              <button className="btn secondary" type="button" onClick={() => setNavLevel("root")}>
                {t("返回首页", "Back to home")}
              </button>
              <span className="pill">{t("上课记录", "Lesson records")}</span>
            </>
          ) : teacherSection === "dailyTasks" ? (
            <button className="btn secondary" type="button" onClick={() => setNavLevel("root")}>
              {t("返回首页", "Back to home")}
            </button>
          ) : (
            <>
              <button className="btn secondary" type="button" onClick={() => setNavLevel("section")}>
                {t("返回作业模块", "Back to homework modules")}
              </button>
              <button className="btn secondary" type="button" onClick={() => setNavLevel("root")}>
                {t("切换作业板块", "Change homework area")}
              </button>
              <span className="pill">{t("作业", "Homework")}</span>
              <span className="pill ok">{activeArea === "writing" ? t("写作", "Writing") : t("口语", "Speaking")}</span>
            </>
          )}
          <span className="pill">{sectionLabel(teacherSection, teacherLanguage)}</span>
        </div>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "students" && (
        <section className="single-column">
          <StudentPanel
            students={students}
            assignments={areaAssignments}
            selectedStudentName={selectedStudentName}
            studentProgress={studentProgress}
            activeArea={activeArea}
            draft={draft}
            setDraft={setDraft}
            token={token}
            hasTeacherAccount={Boolean(account)}
            setMessage={setMessage}
            onSaveHomework={saveAssignment}
            onSelect={loadStudentProgress}
            onPrepareHomework={prepareHomeworkForStudent}
            onAssignHomework={assignHomeworkToStudent}
            onOpenHomework={openStudentHomework}
          />
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "assignments" && (
        <section className="single-column">
          <div className="segmented">
            <button className={`btn ${assignmentView === "history" ? "" : "secondary"}`} onClick={() => setAssignmentView("history")} type="button">
              {t("历史发布作业", "Published homework history")}
            </button>
            <button className={`btn ${assignmentView === "new" ? "" : "secondary"}`} onClick={() => setAssignmentView("new")} type="button">
              {t("发布新作业", "Publish new homework")}
            </button>
          </div>

          {assignmentView === "history" ? (
            <article className="card stack">
              <div className="section-head">
                <div>
                  <h2>{activeArea === "writing" ? t("写作作业历史", "Writing homework history") : t("口语作业历史", "Speaking homework history")}</h2>
                  <div className="hint">{t("查看之前发布的作业和学生提交情况。", "Review previously published homework and student submission status.")}</div>
                </div>
                <button className="btn secondary" onClick={() => loadAreaSubmissions(activeArea)} type="button">
                  {t("刷新状态", "Refresh status")}
                </button>
              </div>
              {areaAssignments.length === 0 ? (
                <p className="hint">{t("还没有发布过作业。", "No homework has been published yet.")}</p>
              ) : (
                <div className="homework-history-grid">
                  {areaAssignments.map((assignment) => {
                    const stats = assignmentStats(assignment.id);
                    return (
                      <div className="homework-history-card" key={assignment.id}>
                        <div className="stack">
                          <strong>{assignment.title}</strong>
                          <span className="hint">{t("创建日期", "Created")}: {formatDate(assignment.created_at)}</span>
                          <span className="hint">{t("截止日期", "Due")}: {assignmentDateLabel(assignment)}</span>
                          <span className="hint">{t("发布给", "Assigned to")}: {assignedStudentsLabel(assignment.assigned_students || [], teacherLanguage)}</span>
                        </div>
                        <div className="homework-history-stats">
                          <span className="pill">{stats.submitted} {t("已提交", "submitted")}</span>
                          <span className={`pill ${stats.reviewed ? "ok" : "warn"}`}>{stats.reviewed} {t("已批改", "reviewed")}</span>
                        </div>
                        <div className="homework-history-actions">
                          <button className="btn secondary" type="button" onClick={() => editAssignment(assignment.id)}>
                            {t("打开", "Open")}
                          </button>
                          <button className="btn danger" disabled={loading} type="button" onClick={() => deleteAssignment(assignment)}>
                            {t("删除", "Delete")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          ) : (
            <article className="card stack">
              <div className="section-head">
                <h2>{activeArea === "writing" ? t("发布写作作业", "Publish writing homework") : t("发布口语作业", "Publish speaking homework")}</h2>
                <button className="btn secondary" type="button" onClick={startNewAssignment}>
                  {t("新建空白作业", "New blank homework")}
                </button>
              </div>
              <div className="publish-homework-layout">
                <aside className="publish-homework-list">
                  <label>{t("已发布作业", "Published homework")}</label>
                  <AssignmentPicker value={selectedId} assignments={areaAssignments} onChange={editAssignment} compact />
                </aside>
                <div className="publish-homework-editor">
                  <AssignmentEditor
                    draft={draft}
                    setDraft={setDraft}
                    students={students}
                    activeArea={activeArea}
                    topicHistory={getStudentTopicHistory(areaAssignments, draft.assigned_students || [], activeArea)}
                    assignedTopicIds={getAssignedTopicIds(areaAssignments, draft.assigned_students || [], activeArea)}
                    token={token}
                    hasTeacherAccount={Boolean(account)}
                    setMessage={setMessage}
                  />
                  <div className="bank-actions">
                    <button className="btn" onClick={() => saveAssignment(false)} disabled={!token && !account} type="button">
                      {t("保存作业", "Save homework")}
                    </button>
                    <button className="btn secondary" onClick={() => saveAssignment(true)} disabled={!token && !account} type="button">
                      {t("另存为新作业", "Save as new homework")}
                    </button>
                  </div>
                  {studentLink && (
                    <div className="question-card">
                      <label>{t("学生链接", "Student link")}</label>
                      <input value={studentLink} readOnly />
                      <button className="btn secondary" onClick={() => navigator.clipboard.writeText(studentLink)} type="button">
                        {t("复制链接", "Copy link")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          )}
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "grading" && (
        <section className="single-column">
          {!isWritingGradingDetail && (
          <aside className="panel grading-finder-bar">
            <div className="section-head">
              <div>
                <h2>{t("待批改作业", "Submissions")}</h2>
                <div className="hint">{t("可以按作业名称或学生查找提交内容。", "Find submissions by homework title or by student.")}</div>
              </div>
              <button
                className="btn secondary"
                onClick={refreshGradingSubmissions}
                disabled={gradingMode === "assignment" ? !selectedId : !(gradingStudentName || selectedStudentName)}
                type="button"
              >
                {t("刷新", "Refresh")}
              </button>
            </div>
            <div className="grading-finder-controls">
              <div className="segmented">
                <button
                  className={`btn ${gradingMode === "assignment" ? "" : "secondary"}`}
                  type="button"
                  onClick={() => setGradingMode("assignment")}
                >
                  {t("按作业查找", "By homework")}
                </button>
                <button
                  className={`btn ${gradingMode === "student" ? "" : "secondary"}`}
                  type="button"
                  onClick={() => setGradingMode("student")}
                >
                  {t("按学生查找", "By student")}
                </button>
              </div>
              {gradingMode === "student" && (
                <div>
                  <label>{t("学生", "Student")}</label>
                  <select
                    value={gradingStudentName}
                    onChange={(event) => void loadSubmissionsByStudent(event.target.value)}
                  >
                    <option value="">{t("选择学生", "Choose student")}</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.name}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                  {!students.length && <p className="hint">{t("还没有学生档案。", "No student profiles yet.")}</p>}
                </div>
              )}
              <div className="grading-finder-count">
                <label>{t("提交记录", "Submissions")}</label>
                <span className="pill">{submissions.length}</span>
              </div>
            </div>
            {gradingMode === "assignment" && (
              <AssignmentPicker
                value={selectedId}
                assignments={areaAssignments}
                onChange={selectAssignment}
                layout="row"
              />
            )}
            {submissions.length === 0 ? (
              <p className="hint">{t("还没有提交记录。", "No submissions yet.")}</p>
            ) : (
              // A scrolling row rather than a column, so the grading area below
              // gets the full width of the page.
              <div className="grading-finder-list">
                {submissions.map((submission) => (
                  <button
                    className={`submission-row ${submission.id === selectedSubmissionId ? "active" : ""}`}
                    key={submission.id}
                    onClick={() => selectSubmission(submission.id)}
                    type="button"
                  >
                    <strong>{submission.student_name}</strong>
                    <span>{submission.submission_title || submissionTitle(submission)}</span>
                    <SpeakingTopicLine submission={submission} />
                    <WritingTopicLine submission={submission} />
                    <span className="hint">{new Date(submission.submitted_at).toLocaleString("zh-CN")}</span>
                    <span className={`pill ${hasPublishedFeedback(submission) ? "ok" : "warn"}`}>
                      {hasPublishedFeedback(submission) ? t("已发布", "Published") : submission.feedback ? t("草稿", "Draft") : t("未批改", "Not reviewed")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>
          )}

          {isWritingGradingDetail && selectedSubmission ? (
            <article className="card stack">
              <div className="section-head">
                <div>
                  <button className="btn secondary compact-button" onClick={() => setGradingDetailOpen(false)} type="button">
                    {t("返回待批改作业", "Back to submissions")}
                  </button>
                  <h2>{selectedSubmission.student_name}</h2>
                  <div className="hint">{selectedSubmission.submission_title || submissionTitle(selectedSubmission)}</div>
                </div>
                <div className="stack">
                  <span className={`pill ${feedbackDraft?.published_at ? "ok" : "warn"}`}>
                    {feedbackDraft?.published_at ? t("已发布", "Published") : feedbackDraft ? t("草稿", "Draft") : t("待批改", "To review")}
                  </span>
                  <button className="btn danger" onClick={deleteSubmission} disabled={loading} type="button">
                    {t("删除提交", "Delete submission")}
                  </button>
                </div>
              </div>
              <div className="writing-review-mode-page">
                <WritingReviewModeList
                  responses={selectedSubmission.writing_responses || []}
                  tasks={getSubmissionWritingTasks(selectedSubmission)}
                  feedback={feedbackDraft || createManualFeedback(selectedSubmission)}
                  savingWritingId={savingWritingId}
                  updateDetail={updateDetail}
                  onRevisionChange={updateWritingRevisionDraft}
                  onRevisionSave={saveWritingRevision}
                />
                <LearningProgressPanel submissions={studentProgress} />
                <button className="btn secondary" onClick={analyzeSubmission} disabled={loading} type="button">
                  {loading ? t("生成中...", "Generating...") : t("生成 AI 反馈草稿", "Generate AI feedback draft")}
                </button>
                <FeedbackEditor
                  feedback={feedbackDraft || createManualFeedback(selectedSubmission)}
                  updateComment={(overall_comment) => setFeedbackDraft({ ...(feedbackDraft || createManualFeedback(selectedSubmission)), overall_comment })}
                  updateDetail={updateDetail}
                  publish={publishFeedback}
                />
              </div>
            </article>
          ) : activeArea !== "writing" ? (
          <div className="stack">
            {selectedSubmission ? (
              <article className="card stack">
                <div className="section-head">
                  <div>
                    <h2>{selectedSubmission.student_name}</h2>
                    <div className="hint">{selectedSubmission.submission_title || submissionTitle(selectedSubmission)}</div>
                  </div>
                  <div className="stack">
                    <span className={`pill ${feedbackDraft?.published_at ? "ok" : "warn"}`}>
                      {feedbackDraft?.published_at ? t("已发布", "Published") : feedbackDraft ? t("草稿", "Draft") : t("待批改", "To review")}
                    </span>
                    <button className="btn danger" onClick={deleteSubmission} disabled={loading} type="button">
                      {t("删除提交", "Delete submission")}
                    </button>
                  </div>
                </div>
                {isWritingSubmission(selectedSubmission) ? (
                  <WritingResponseList
                    responses={selectedSubmission.writing_responses || []}
                    tasks={getSubmissionWritingTasks(selectedSubmission)}
                    feedback={feedbackDraft || createManualFeedback(selectedSubmission)}
                    savingWritingId={savingWritingId}
                    updateDetail={updateDetail}
                    onRevisionChange={updateWritingRevisionDraft}
                    onRevisionSave={saveWritingRevision}
                  />
                ) : (
                <RecordingList
                  recordings={selectedSubmission.recordings || []}
                  questionItems={getSubmissionQuestionItems(selectedSubmission)}
                  feedback={feedbackDraft || createManualFeedback(selectedSubmission)}
                  updateDetail={updateDetail}
                    transcribingId={transcribingId}
                    savingTranscriptId={savingTranscriptId}
                    onTranscribe={transcribeRecording}
                    onTranscriptChange={updateTranscriptDraft}
                    onTranscriptSave={saveCorrectedTranscript}
                    uploadingDemoId={uploadingDemoId}
                    onDemoUpload={uploadTeacherDemo}
                  />
                )}
                <LearningProgressPanel submissions={studentProgress} />
                <button className="btn secondary" onClick={analyzeSubmission} disabled={loading} type="button">
                  {loading ? t("生成中...", "Generating...") : t("生成 AI 反馈草稿", "Generate AI feedback draft")}
                </button>
                <FeedbackEditor
                  feedback={feedbackDraft || createManualFeedback(selectedSubmission)}
                  updateComment={(overall_comment) => setFeedbackDraft({ ...(feedbackDraft || createManualFeedback(selectedSubmission)), overall_comment })}
                  updateDetail={updateDetail}
                  publish={publishFeedback}
                />
              </article>
            ) : (
              <article className="card stack">
                <h2>{t("作业批改", "Homework grading")}</h2>
                <p className="hint">{t("请选择一份作业和学生提交记录开始批改。", "Choose a homework item and a student submission to start grading.")}</p>
              </article>
            )}
          </div>
          ) : (
            <article className="card stack">
              <h2>{t("作业批改", "Homework grading")}</h2>
              <p className="hint">{t("请先在上方筛选并点开一份写作提交。", "Find and open a writing submission first.")}</p>
            </article>
          )}
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "schedule" && (
        <section className="single-column">
          <TeacherSchedulePanel token={token} />
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "lessonRecording" && (
        <section className="single-column">
          <TeacherLessonRecordsPanel students={students} assignments={assignments} api={api} />
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "dailyTasks" && (
        <section className="single-column">
          <TeacherDailyTasksPanel students={students} api={api} mode={dailyTaskMode} language={teacherLanguage} />
        </section>
      )}
    </main>
  );
}

function feedbackForSubmission(submission: Submission) {
  const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null;
  if (!feedback) return createManualFeedback(submission);
  return {
    ...feedback,
    details: mergeFeedbackDetails(feedback.details || [], submission)
  };
}

function createManualFeedback(submission: Submission): Feedback {
  return {
    submission_id: submission.id,
    overall_score: 0,
    overall_comment: "",
    transcript: "",
    details: mergeFeedbackDetails([], submission)
  };
}

function submissionTitle(submission: Submission) {
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  return assignment?.title || "口语作业";
}

function assignmentArea(assignment: Pick<Assignment, "assignment_type" | "writing_tasks">): AssignmentType {
  if (assignment.assignment_type === "writing") return "writing";
  if (assignment.assignment_type === "speaking") return "speaking";
  return assignment.writing_tasks?.length ? "writing" : "speaking";
}

function assignedStudentsLabel(students: string[], language: TeacherLanguage = "zh") {
  const assigned = cleanStudentNames(students);
  return assigned.length ? assigned.join(", ") : language === "zh" ? "所有学生" : "All students";
}

function buildSpeakingHomeworkTitle(assignment: Pick<Assignment, "p1_questions" | "p2_prompt">) {
  return `P1 - ${getP1TopicForTitle(assignment.p1_questions || [])}; P2 - ${getP2TopicForTitle(assignment.p2_prompt || "")}`;
}

function isAutoSpeakingHomeworkTitle(value: string) {
  return /^P1\s*-\s*.+;\s*P2\s*-\s*.+$/i.test(value.trim());
}

function getP1TopicForTitle(questions: string[]) {
  const topics = summarizeP1Topics(questions);
  return topics[0] || "NA";
}

function getP2TopicForTitle(prompt: string) {
  const topic = summarizeP2Prompt(prompt);
  return topic ? topic.replace(/[.!?]+$/g, "") : "NA";
}

function assignmentsForStudents(assignments: Assignment[], studentNames: string[], area: AssignmentType) {
  const selectedStudents = cleanStudentNames(studentNames);
  if (!selectedStudents.length) return [];

  return assignments.filter((assignment) => {
    if (assignmentArea(assignment) !== area) return false;
    return selectedStudents.some((studentName) => assignmentIsVisibleToStudent(assignment, studentName));
  });
}

/**
 * Question bank ids already assigned to the selected students, so the pickers
 * can flag them. Matching on bank ids rather than the display strings in
 * StudentTopicHistory keeps this accurate when a teacher has edited the
 * wording of a question.
 */
function getAssignedTopicIds(assignments: Assignment[], studentNames: string[], area: AssignmentType) {
  if (area !== "speaking") return { p1: new Set<string>(), p2: new Set<string>() };

  const ids = getSpeakingTopicIdsFromAssignments(assignmentsForStudents(assignments, studentNames, area));
  return { p1: new Set(ids.p1), p2: new Set(ids.p2) };
}

function getStudentTopicHistory(assignments: Assignment[], studentNames: string[], area: AssignmentType): StudentTopicHistory {
  const relevant = assignmentsForStudents(assignments, studentNames, area);
  if (!relevant.length) return { p1: [], p2: [], writing: [] };

  return {
    p1: uniqueStrings(relevant.flatMap((assignment) => summarizeP1Topics(assignment.p1_questions || []))),
    p2: uniqueStrings(relevant.map((assignment) => summarizeP2Prompt(assignment.p2_prompt)).filter(Boolean)),
    writing: uniqueStrings(
      relevant.flatMap((assignment) =>
        (assignment.writing_tasks || []).map((task) => task.title || firstMeaningfulLine(task.prompt) || task.label)
      )
    )
  };
}

function summarizeP1Topics(questions: string[]) {
  const normalizedQuestions = questions.map(normalizeQuestionText);
  const bankTopics = p1QuestionBank
    .filter((set) => set.questions.some((question) => normalizedQuestions.includes(normalizeQuestionText(question))))
    .map((set) => set.topic);
  if (bankTopics.length) return bankTopics;

  return questions.map(extractP1Topic).filter(Boolean);
}

function summarizeP2Prompt(prompt: string) {
  const line = firstMeaningfulLine(prompt).replace(/\s+/g, " ").trim();
  if (!line) return "";
  const match = line.match(/^(Describe\b.+?)(?:[.!?]\s*)?$/i);
  return match ? ensurePeriod(match[1].trim()) : line;
}

function extractP1Topic(question: string) {
  const clean = question.replace(/\s+/g, " ").trim();
  const patterns = [
    /\babout\s+(.+?)(?:\?|$)/i,
    /\bof\s+(.+?)(?:\?|$)/i,
    /\btypes?\s+of\s+(.+?)(?:\?|$)/i,
    /\bdo you like\s+(.+?)(?:\?|$)/i
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return normalizeTopicLabel(match[1]);
  }
  return "";
}

function normalizeTopicLabel(value: string) {
  return value
    .replace(/^(the|a|an|your|any|some)\s+/i, "")
    .replace(/\s+(now|in your city|in your country|when you were a kid|as a child|in the future)$/i, "")
    .replace(/[?.!,]+$/g, "")
    .trim();
}

function normalizeQuestionText(value: string) {
  return value.replace(/\s+/g, " ").replace(/[?.!,]+$/g, "").trim().toLowerCase();
}

function ensurePeriod(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function assignmentIsVisibleToStudent(assignment: Assignment, studentName: string) {
  const assigned = cleanStudentNames(assignment.assigned_students || []);
  if (!assigned.length) return true;
  const normalized = normalizeStudentName(studentName);
  return assigned.some((name) => normalizeStudentName(name) === normalized);
}

function firstMeaningfulLine(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const clean = value.trim();
    const key = normalizeStudentName(clean);
    if (!clean || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assignmentDateLabel(assignment: Pick<Assignment, "due_date" | "deadline_text">) {
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

function isWritingSubmission(submission: Submission) {
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  return assignment?.assignment_type === "writing" || Boolean(submission.writing_responses?.length);
}

function getSubmissionWritingTasks(submission: Submission) {
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  return assignment?.writing_tasks || [];
}

function getSubmissionQuestionItems(submission: Submission) {
  const assignment = (Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments) as
    | SubmissionAssignmentWithQuestions
    | null
    | undefined;
  if (!assignment?.p1_questions && !assignment?.p2_prompt && !assignment?.p3_questions) {
    return (submission.recordings || []).map((recording) => ({
      key: recording.question_key,
      part: recording.question_key === "p2" ? "p2" : recording.question_key.startsWith("p3") ? "p3" : "p1",
      label: recording.question_label,
      question: recording.question_text
    })) as QuestionItem[];
  }

  return getQuestionItems({
    id: assignment.id,
    assignment_type: assignment.assignment_type || "speaking",
    title: assignment.title,
    deadline_text: assignment.deadline_text,
    p1_questions: assignment.p1_questions || [],
    p2_prompt: assignment.p2_prompt || "",
    p3_questions: assignment.p3_questions || [],
    writing_tasks: assignment.writing_tasks || [],
    training_note: "",
    assigned_students: [],
    is_active: true
  });
}

function hasPublishedFeedback(submission: Submission) {
  const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null;
  return Boolean(feedback?.published_at);
}

function sectionLabel(section: "students" | "assignments" | "grading" | "schedule" | "lessonRecording" | "dailyTasks", language: TeacherLanguage = "zh") {
  const labels: Record<typeof section, { zh: string; en: string }> = {
    students: { zh: "学生情况", en: "Student profiles" },
    assignments: { zh: "作业布置", en: "Homework publishing" },
    grading: { zh: "作业批改", en: "Homework grading" },
    schedule: { zh: "课程排课", en: "Lesson scheduling" },
    lessonRecording: { zh: "上课记录", en: "Lesson records" },
    dailyTasks: { zh: "每日任务", en: "Daily tasks" }
  };
  return labels[section][language];
}

function lessonSectionLabel(section: LessonRecord["sections"][number]) {
  if (section === "Speaking") return "口语";
  if (section === "Listening") return "听力";
  if (section === "Reading") return "阅读";
  if (section === "Writing") return "写作";
  return section;
}

function SpeakingTopicLine({
  assignment,
  submission
}: {
  assignment?: Pick<Assignment, "assignment_type" | "p1_questions" | "p2_prompt">;
  submission?: Submission;
}) {
  const source = assignment || getSubmissionAssignment(submission);
  if (!source || (source.assignment_type || "speaking") !== "speaking") return null;
  const p1Topic = getP1TopicForTitle(source.p1_questions || []);
  const p2Topic = getP2TopicForTitle(source.p2_prompt || "");
  return (
    <span className="topic-chip-group">
      <span className="topic-chip">
        <strong>P1</strong>
        {p1Topic}
      </span>
      <span className="topic-chip">
        <strong>P2</strong>
        {p2Topic}
      </span>
    </span>
  );
}

function WritingTopicLine({
  assignment,
  submission
}: {
  assignment?: Pick<Assignment, "assignment_type" | "writing_tasks">;
  submission?: Submission;
}) {
  const source = assignment || getSubmissionWritingAssignment(submission);
  if (!source || source.assignment_type !== "writing") return null;
  return (
    <span className="topic-chip-group">
      <span className="topic-chip">
        <strong>Task 1</strong>
        {getWritingTask1Type(source.writing_tasks || [])}
      </span>
      <span className="topic-chip">
        <strong>Task 2</strong>
        {getWritingTask2Topic(source.writing_tasks || [])}
      </span>
    </span>
  );
}

function getSubmissionAssignment(submission?: Submission) {
  if (!submission) return null;
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  if (!assignment) return null;
  return {
    assignment_type: assignment.assignment_type || "speaking",
    p1_questions: assignment.p1_questions || [],
    p2_prompt: assignment.p2_prompt || ""
  };
}

function getSubmissionWritingAssignment(submission?: Submission) {
  if (!submission) return null;
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  if (!assignment) return null;
  return {
    assignment_type: assignment.assignment_type || "speaking",
    writing_tasks: assignment.writing_tasks || []
  };
}

function getWritingTask1Type(tasks: WritingTask[]) {
  return tasks.find((task) => task.key === "writing_task_1")?.task1_type?.trim() || "NA";
}

function getWritingTask2Topic(tasks: WritingTask[]) {
  const task = tasks.find((item) => item.key === "writing_task_2");
  return [task?.task2_type?.trim(), task?.topic?.trim()].filter(Boolean).join(" | ") || "NA";
}

type UsageItem = { key: string; label: string; used: number; limit: number; unit: "seconds" | "calls" | "bytes" };

/**
 * This month's consumption against the plan.
 *
 * Quotas without a gauge are how a teacher discovers a limit: mid-task, as an
 * error. Shown on the workspace page so the number is seen before it bites.
 */
function UsagePanel({ language }: { language: TeacherLanguage }) {
  const [usage, setUsage] = useState<{ plan: string; estimatedCostCny: number; items: UsageItem[] } | null>(null);
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/usage")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.items) setUsage(data);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage) return null;

  return (
    <div className="question-card stack">
      <div className="section-head compact">
        <div>
          <label>{t("本月用量", "This month")}</label>
          <div className="hint">{t("超出额度后转写和 AI 批改会暂停，下月 1 日重置。", "Transcription and AI review pause once a limit is reached, and reset on the 1st.")}</div>
        </div>
        <span className="pill">{usage.plan}</span>
      </div>
      <div className="usage-meters">
        {usage.items.map((item) => {
          const percent = item.limit > 0 ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
          const tone = percent >= 90 ? "danger" : percent >= 70 ? "warn" : "ok";
          return (
            <div className="usage-meter" key={item.key}>
              <div className="usage-meter-head">
                <strong>{item.label}</strong>
                <span className={`pill usage-${tone}`}>{percent}%</span>
              </div>
              <div className="usage-meter-track">
                <div className={`usage-meter-fill ${tone}`} style={{ width: `${percent}%` }} />
              </div>
              <span className="hint">{formatUsage(item)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatUsage(item: UsageItem) {
  if (item.unit === "seconds") return `${Math.round(item.used / 60)} / ${Math.round(item.limit / 60)} 分钟`;
  if (item.unit === "bytes") {
    const gb = (value: number) => (value / 1024 / 1024 / 1024).toFixed(1);
    return `${gb(item.used)} / ${gb(item.limit)} GB`;
  }
  return `${item.used} / ${item.limit} 次`;
}

function AssignmentPicker({
  value,
  assignments,
  onChange,
  compact = false,
  layout = "list"
}: {
  value: string;
  assignments: Assignment[];
  onChange: (id: string) => void;
  compact?: boolean;
  /** "row" scrolls sideways, for use above the content rather than beside it. */
  layout?: "list" | "row";
}) {
  if (!assignments.length) return <p className="hint">还没有保存过作业。</p>;

  const containerClass = layout === "row" ? "assignment-row-list" : compact ? "compact-assignment-list" : "stack";

  return (
    <div className={containerClass}>
      {assignments.map((assignment) => (
        <button
          className={`${compact || layout === "row" ? "compact-assignment-row" : "submission-row"} ${assignment.id === value ? "active" : ""}`}
          key={assignment.id}
          onClick={() => onChange(assignment.id)}
          type="button"
        >
          <strong>{assignment.title}</strong>
          <SpeakingTopicLine assignment={assignment} />
          <WritingTopicLine assignment={assignment} />
          {!compact && <span className="pill">{assignment.assignment_type === "writing" ? "写作" : "口语"}</span>}
          <span className="hint">{assignmentDateLabel(assignment)}</span>
        </button>
      ))}
    </div>
  );
}

function AssignmentEditor({
  draft,
  setDraft,
  students,
  activeArea,
  topicHistory,
  assignedTopicIds,
  token,
  hasTeacherAccount,
  setMessage
}: {
  draft: DraftAssignment;
  setDraft: (draft: DraftAssignment) => void;
  students: StudentProfile[];
  activeArea: AssignmentType;
  topicHistory: StudentTopicHistory;
  assignedTopicIds: { p1: Set<string>; p2: Set<string> };
  token: string;
  hasTeacherAccount: boolean;
  setMessage: (message: string) => void;
}) {
  const [selectedP1SetId, setSelectedP1SetId] = useState(p1QuestionBank[0]?.id || "");
  const [selectedP2P3SetId, setSelectedP2P3SetId] = useState(p2P3QuestionBank[0]?.id || "");
  const suggestedSpeakingTitle = buildSpeakingHomeworkTitle(draft);
  const titleIsAutoGenerated =
    activeArea === "speaking" && (!draft.title.trim() || isAutoSpeakingHomeworkTitle(draft.title));

  const selectedP1Set = p1QuestionBank.find((set) => set.id === selectedP1SetId) || p1QuestionBank[0];
  const selectedP2P3Set = p2P3QuestionBank.find((set) => set.id === selectedP2P3SetId) || p2P3QuestionBank[0];

  function addP1Set() {
    if (!selectedP1Set) return;
    updateSpeakingDraft({
      ...draft,
      p1_questions: appendUniqueQuestions(draft.p1_questions, selectedP1Set.questions)
    });
  }

  function replaceP1Set() {
    if (!selectedP1Set) return;
    updateSpeakingDraft({ ...draft, p1_questions: selectedP1Set.questions });
  }

  function applyP2P3Set() {
    if (!selectedP2P3Set) return;
    updateSpeakingDraft({
      ...draft,
      p2_prompt: selectedP2P3Set.p2Prompt,
      p3_questions: selectedP2P3Set.p3Questions
    });
  }

  function updateSpeakingDraft(nextDraft: DraftAssignment) {
    if (activeArea !== "speaking") {
      setDraft(nextDraft);
      return;
    }
    setDraft(titleIsAutoGenerated ? { ...nextDraft, title: buildSpeakingHomeworkTitle(nextDraft) } : nextDraft);
  }

  return (
    <div className="stack">
      <div>
        <label>作业标题</label>
        <input
          value={draft.title}
          placeholder={activeArea === "speaking" ? suggestedSpeakingTitle : ""}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        {activeArea === "speaking" && <p className="hint">建议标题：{suggestedSpeakingTitle}。你可以手动修改。</p>}
      </div>
      <div>
        <label>创建日期</label>
        <input value={draft.created_at ? formatDate(draft.created_at) : "保存时自动生成"} readOnly />
      </div>
      <div>
        <label>截止日期</label>
        <input
          type="date"
          value={draft.due_date || ""}
          onChange={(event) => setDraft({ ...draft, due_date: event.target.value, deadline_text: event.target.value })}
        />
      </div>
      <div>
        <label>训练说明</label>
        <textarea value={draft.training_note} onChange={(event) => setDraft({ ...draft, training_note: event.target.value })} />
      </div>
      <div className="area-badge">
        <label>当前板块</label>
        <span className="pill ok">{activeArea === "writing" ? "仅写作作业" : "仅口语作业"}</span>
      </div>
      <div>
        <label>分配学生</label>
        <StudentAssignmentSelector
          selected={draft.assigned_students || []}
          students={students}
          onChange={(assigned_students) => setDraft({ ...draft, assigned_students })}
        />
        <p className="hint">如果不勾选任何学生，这份作业会对所有学生可见。</p>
      </div>
      <StudentTopicHistoryPanel activeArea={activeArea} history={topicHistory} />
      {activeArea === "writing" ? (
        <WritingTaskInputs
          tasks={draft.writing_tasks || []}
          token={token}
          hasTeacherAccount={hasTeacherAccount}
          setMessage={setMessage}
          onChange={(writing_tasks) => setDraft({ ...draft, writing_tasks })}
        />
      ) : (
        <>
          <div className="bank-panel">
            <div>
              <label>Part 1 题库</label>
              <select value={selectedP1SetId} onChange={(event) => setSelectedP1SetId(event.target.value)}>
                {p1QuestionBank.map((set) => (
                  <option key={set.id} value={set.id}>
                    {assignedTopicIds.p1.has(set.id) ? `${set.topic}（已布置过）` : set.topic}
                  </option>
                ))}
              </select>
              {selectedP1Set && assignedTopicIds.p1.has(selectedP1Set.id) && (
                <p className="hint warn">这个话题已经布置给该学生了。</p>
              )}
            </div>
            {selectedP1Set && (
              <div className="bank-preview">
                {selectedP1Set.questions.map((question, index) => (
                  <div key={question}>{`${index + 1}. ${question}`}</div>
                ))}
              </div>
            )}
            <div className="bank-actions">
              <button className="btn ghost" type="button" onClick={addP1Set}>
                添加到 Part 1
              </button>
              <button className="btn secondary" type="button" onClick={replaceP1Set}>
                替换 Part 1
              </button>
            </div>
          </div>
          <QuestionInputs title="Part 1 题目" values={draft.p1_questions} onChange={(p1_questions) => updateSpeakingDraft({ ...draft, p1_questions })} />
          <div className="bank-panel">
            <div>
              <label>Part 2 & 3 题库</label>
              <select value={selectedP2P3SetId} onChange={(event) => setSelectedP2P3SetId(event.target.value)}>
                {p2P3QuestionBank.map((set) => (
                  <option key={set.id} value={set.id}>
                    {assignedTopicIds.p2.has(set.id) ? `${set.topic}（已布置过）` : set.topic}
                  </option>
                ))}
              </select>
              {selectedP2P3Set && assignedTopicIds.p2.has(selectedP2P3Set.id) && (
                <p className="hint warn">这个话题已经布置给该学生了。</p>
              )}
            </div>
            {selectedP2P3Set && (
              <div className="bank-preview">
                <strong>{selectedP2P3Set.topic}</strong>
                <span>{selectedP2P3Set.p2Prompt.split("\n")[0]}</span>
                {selectedP2P3Set.p3Questions.map((question, index) => (
                  <div key={question}>{`P3-${index + 1}. ${question}`}</div>
                ))}
              </div>
            )}
            <button className="btn ghost" type="button" onClick={applyP2P3Set}>
              应用到 Part 2 & 3
            </button>
          </div>
          <div>
            <label>Part 2 题卡</label>
            <textarea value={draft.p2_prompt} onChange={(event) => updateSpeakingDraft({ ...draft, p2_prompt: event.target.value })} />
          </div>
          <QuestionInputs title="Part 3 题目" values={draft.p3_questions} onChange={(p3_questions) => updateSpeakingDraft({ ...draft, p3_questions })} />
        </>
      )}
    </div>
  );
}

function StudentTopicHistoryPanel({
  activeArea,
  history
}: {
  activeArea: AssignmentType;
  history: StudentTopicHistory;
}) {
  const total = activeArea === "writing" ? history.writing.length : history.p1.length + history.p2.length;

  return (
    <div className="question-card stack">
      <div className="section-head compact">
        <div>
          <label>该学生之前发布过的话题</label>
          <div className="hint">选新题前可以快速检查，避免重复。</div>
        </div>
        <span className="pill">{total} 个话题</span>
      </div>
      {total ? (
        activeArea === "writing" ? (
          <TopicList title="写作任务" items={history.writing} />
        ) : (
          <div className="topic-history-grid">
            <TopicList title="Part 1" items={history.p1} />
            <TopicList title="Part 2" items={history.p2} />
          </div>
        )
      ) : (
        <p className="hint">请选择学生，或先为该学生发布第一份作业来生成话题历史。</p>
      )}
    </div>
  );
}

function TopicList({ title, items }: { title: string; items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 12);

  return (
    <div className="topic-history-list">
      <strong>{title}</strong>
      {items.length ? (
        <ul>
          {visible.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="hint">还没有话题记录。</p>
      )}
      {items.length > 12 && (
        <button className="btn link" type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起" : `展开全部 ${items.length} 个`}
        </button>
      )}
    </div>
  );
}

function StudentAssignmentSelector({
  selected,
  students,
  onChange
}: {
  selected: string[];
  students: StudentProfile[];
  onChange: (students: string[]) => void;
}) {
  const [manualName, setManualName] = useState("");
  const selectedKeys = new Set(selected.map(normalizeStudentName));

  function toggleStudent(name: string) {
    const key = normalizeStudentName(name);
    if (selectedKeys.has(key)) {
      onChange(selected.filter((student) => normalizeStudentName(student) !== key));
      return;
    }
    onChange(cleanStudentNames([...selected, name]));
  }

  function addManualStudent() {
    const name = manualName.trim();
    if (!name) return;
    onChange(cleanStudentNames([...selected, name]));
    setManualName("");
  }

  return (
    <div className="student-selector">
      {students.length ? (
        <div className="student-check-list">
          {students.map((student) => (
            <label className="check-row" key={student.id}>
              <input
                checked={selectedKeys.has(student.normalized_name)}
                onChange={() => toggleStudent(student.name)}
                type="checkbox"
              />
              <span>{student.name}</span>
              <small>{student.submission_count || 0} 次提交</small>
            </label>
          ))}
        </div>
      ) : (
        <p className="hint">还没有学生档案。学生注册或填写姓名后会出现在这里。</p>
      )}
      <div className="manual-student-row">
        <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="添加学生姓名" />
        <button className="btn secondary" onClick={addManualStudent} type="button">
          添加
        </button>
      </div>
      {selected.length > 0 && (
        <div className="selected-students">
          {selected.map((student) => (
            <button className="pill removable" key={student} onClick={() => toggleStudent(student)} type="button">
              {student} x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function appendUniqueQuestions(current: string[], incoming: string[]) {
  const existing = new Set(current.map((question) => question.trim().toLowerCase()).filter(Boolean));
  const next = [...current];
  incoming.forEach((question) => {
    if (!existing.has(question.trim().toLowerCase())) {
      next.push(question);
    }
  });
  return next;
}

function parseStudentNames(value: string) {
  return value
    .split(/[\n,;，；]+/)
    .map((student) => student.trim())
    .filter(Boolean);
}

function cleanStudentNames(values: string[]) {
  const seen = new Set<string>();
  const students: string[] = [];
  values.forEach((value) => {
    const student = value.trim();
    const key = student.toLowerCase();
    if (student && !seen.has(key)) {
      seen.add(key);
      students.push(student);
    }
  });
  return students;
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}

function getStudentHomeworkRows(assignments: Assignment[], submissions: Submission[], studentName: string, activeArea: AssignmentType) {
  const submissionsByAssignment = new Map<string, Submission>();
  submissions.forEach((submission) => {
    const existing = submissionsByAssignment.get(submission.assignment_id);
    if (!existing || new Date(submission.submitted_at).getTime() > new Date(existing.submitted_at).getTime()) {
      submissionsByAssignment.set(submission.assignment_id, submission);
    }
  });

  const rows = assignments
    .filter((assignment) => assignmentArea(assignment) === activeArea && assignmentIsVisibleToStudent(assignment, studentName))
    .map((assignment) => {
      const submission = submissionsByAssignment.get(assignment.id);
      const reviewed = submission ? hasPublishedFeedback(submission) : false;
      return {
        key: assignment.id,
        assignment,
        submission,
        title: submission?.submission_title || assignment.title,
        status: reviewed ? "reviewed" : submission ? "submitted" : "assigned",
        dateLabel: submission
          ? `提交时间：${new Date(submission.submitted_at).toLocaleString("zh-CN")}`
          : `发布时间：${assignment.created_at ? formatDate(assignment.created_at) : "暂无日期"}${assignment.due_date ? ` | 截止日期：${formatDate(assignment.due_date)}` : ""}`
      };
    });

  const rowAssignmentIds = new Set(rows.map((row) => row.assignment.id));
  submissions.forEach((submission) => {
    if (rowAssignmentIds.has(submission.assignment_id)) return;
    const assignment = assignmentFromSubmission(submission);
    if (!assignment || assignmentArea(assignment) !== activeArea) return;
    const reviewed = hasPublishedFeedback(submission);
    rows.push({
      key: submission.id,
      assignment,
      submission,
      title: submission.submission_title || assignment.title,
      status: reviewed ? "reviewed" : "submitted",
      dateLabel: `提交时间：${new Date(submission.submitted_at).toLocaleString("zh-CN")}`
    });
  });

  return rows.sort((a, b) => {
    const aTime = new Date(a.submission?.submitted_at || a.assignment.created_at || 0).getTime();
    const bTime = new Date(b.submission?.submitted_at || b.assignment.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function assignmentFromSubmission(submission: Submission): Assignment | null {
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  if (!assignment) return null;
  return {
    id: assignment.id,
    assignment_type: assignment.assignment_type || "speaking",
    title: assignment.title,
    deadline_text: assignment.deadline_text || "",
    due_date: assignment.due_date || null,
    p1_questions: assignment.p1_questions || [],
    p2_prompt: assignment.p2_prompt || "",
    p3_questions: assignment.p3_questions || [],
    writing_tasks: assignment.writing_tasks || [],
    training_note: "",
    assigned_students: [submission.student_name],
    is_active: true
  };
}

function TeacherLessonRecordsPanel({
  students,
  assignments,
  api
}: {
  students: StudentProfile[];
  assignments: Assignment[];
  api: (path: string, init?: RequestInit) => Promise<any>;
}) {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [records, setRecords] = useState<LessonRecord[]>([]);
  const [lessonAt, setLessonAt] = useState(() => toDateTimeLocalValue(new Date()));
  const [sections, setSections] = useState<LessonRecord["sections"]>(["Speaking"]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [preHomeworkIds, setPreHomeworkIds] = useState<string[]>([]);
  const [postHomeworkIds, setPostHomeworkIds] = useState<string[]>([]);
  const [preparationNote, setPreparationNote] = useState("");
  const [homeworkNote, setHomeworkNote] = useState("");
  const [status, setStatus] = useState("");
  const [loadingRecords, setLoadingRecords] = useState(false);
  const studentAssignments = selectedStudent
    ? assignments.filter((assignment) => assignmentIsVisibleToStudent(assignment, selectedStudent))
    : [];
  const studentAssignmentIds = new Set(studentAssignments.map((assignment) => assignment.id));

  useEffect(() => {
    if (!selectedStudent && students[0]) setSelectedStudent(students[0].name);
  }, [selectedStudent, students]);

  useEffect(() => {
    if (selectedStudent) void loadRecords(selectedStudent);
  }, [selectedStudent]);

  useEffect(() => {
    setPreHomeworkIds((ids) => ids.filter((id) => studentAssignmentIds.has(id)));
    setPostHomeworkIds((ids) => ids.filter((id) => studentAssignmentIds.has(id)));
  }, [selectedStudent, assignments]);

  async function loadRecords(studentName: string) {
    setLoadingRecords(true);
    setStatus("");
    try {
      const data = await api(`/api/teacher/lesson-records?studentName=${encodeURIComponent(studentName)}`);
      setRecords(data.records || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "无法加载上课记录。");
    } finally {
      setLoadingRecords(false);
    }
  }

  async function saveRecord() {
    if (!selectedStudent) {
      setStatus("请选择学生。");
      return;
    }
    setLoadingRecords(true);
    setStatus("");
    try {
      const data = await api("/api/teacher/lesson-records", {
        method: "POST",
        body: JSON.stringify({
          studentName: selectedStudent,
          lessonAt: new Date(lessonAt).toISOString(),
          sections,
          durationMinutes,
          preHomeworkAssignmentIds: preHomeworkIds,
          postHomeworkAssignmentIds: postHomeworkIds,
          preparationNote,
          homeworkNote
        })
      });
      setRecords([data.record, ...records]);
      setLessonAt(toDateTimeLocalValue(new Date()));
      setSections(["Speaking"]);
      setDurationMinutes(60);
      setPreHomeworkIds([]);
      setPostHomeworkIds([]);
      setPreparationNote("");
      setHomeworkNote("");
      setStatus("上课记录已保存。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "无法保存上课记录。");
    } finally {
      setLoadingRecords(false);
    }
  }

  function toggleSection(section: LessonRecord["sections"][number]) {
    setSections((current) => {
      if (current.includes(section)) return current.length === 1 ? current : current.filter((item) => item !== section);
      return [...current, section];
    });
  }

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>上课记录</h2>
          <div className="hint">选择学生后，添加上课记录并关联对应作业。</div>
        </div>
        <span className="pill">{students.length} 位学生</span>
      </div>
      <div className="student-profile-layout">
        <aside className="stack">
          {students.length ? (
            students.map((student) => (
              <button
                className={`daily-student-card ${student.name === selectedStudent ? "active" : ""}`}
                key={student.id}
                type="button"
                onClick={() => setSelectedStudent(student.name)}
              >
                <strong>{student.name}</strong>
                <span>{student.phone || student.normalized_name}</span>
              </button>
            ))
          ) : (
            <p className="hint">还没有学生档案。</p>
          )}
        </aside>
        <div className="stack">
          <section className="question-card stack">
            <div className="section-head compact">
              <h3>新增上课记录</h3>
              <span className="pill">{selectedStudent || "未选择学生"}</span>
            </div>
            <div className="form-grid">
              <div>
                <label>上课时间</label>
                <input type="datetime-local" value={lessonAt} onChange={(event) => setLessonAt(event.target.value)} />
              </div>
              <div>
                <label>上课时长</label>
                <input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) || 0)} />
              </div>
            </div>
            <div>
              <label>上课板块</label>
              <div className="checkbox-grid">
                {(["Speaking", "Listening", "Reading", "Writing"] as LessonRecord["sections"]).map((section) => (
                  <label className="check-row" key={section}>
                    <input type="checkbox" checked={sections.includes(section)} onChange={() => toggleSection(section)} />
                    {lessonSectionLabel(section)}
                  </label>
                ))}
              </div>
            </div>
            <HomeworkCheckboxes title="课前作业" assignments={studentAssignments} selectedIds={preHomeworkIds} setSelectedIds={setPreHomeworkIds} />
            <div>
              <label>课前准备</label>
              <textarea value={preparationNote} onChange={(event) => setPreparationNote(event.target.value)} placeholder="学生课前需要准备的内容。" />
            </div>
            <HomeworkCheckboxes title="课后作业" assignments={studentAssignments} selectedIds={postHomeworkIds} setSelectedIds={setPostHomeworkIds} />
            <div>
              <label>课后作业备注</label>
              <textarea value={homeworkNote} onChange={(event) => setHomeworkNote(event.target.value)} placeholder="本节课额外作业备注。" />
            </div>
            <button className="btn" type="button" disabled={loadingRecords || !selectedStudent || !sections.length || !lessonAt} onClick={saveRecord}>
              {loadingRecords ? "保存中..." : "保存上课记录"}
            </button>
            {status && <p className={status.includes("Could not") || status.includes("Please") ? "error" : "hint"}>{status}</p>}
          </section>

          <section className="stack">
            <div className="section-head compact">
              <h3>上课历史</h3>
              <span className="pill">{records.length}</span>
            </div>
            {records.length ? (
              records.map((record) => (
                <div className="submission-row" key={record.id}>
                  <div className="homework-history-title-row">
                    <strong>{new Date(record.lesson_at).toLocaleString("zh-CN")}</strong>
                    <span className="pill">{record.duration_minutes} 分钟</span>
                  </div>
                  <div className="topic-chip-group">
                    {(record.sections || []).map((section) => (
                      <span className="topic-chip" key={section}>
                        {lessonSectionLabel(section)}
                      </span>
                    ))}
                  </div>
                  <LinkedHomework label="课前作业" assignments={record.pre_homework || []} />
                  {record.preparation_note && <p className="hint">课前准备：{record.preparation_note}</p>}
                  <LinkedHomework label="课后作业" assignments={record.post_homework || []} />
                  {record.homework_note && <p className="hint">课后作业备注：{record.homework_note}</p>}
                </div>
              ))
            ) : (
              <p className="hint">{loadingRecords ? "正在加载上课记录..." : "该学生还没有上课记录。"}</p>
            )}
          </section>
        </div>
      </div>
    </article>
  );
}

function HomeworkCheckboxes({
  title,
  assignments,
  selectedIds,
  setSelectedIds
}: {
  title: string;
  assignments: Assignment[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
}) {
  return (
    <div>
      <label>{title}</label>
      <div className="lesson-homework-list">
        {assignments.length ? (
          assignments.map((assignment) => (
            <label className="check-row" key={assignment.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(assignment.id)}
                onChange={(event) => {
                  setSelectedIds(event.target.checked ? [...selectedIds, assignment.id] : selectedIds.filter((id) => id !== assignment.id));
                }}
              />
              <span>
                {assignment.title}
                <span className="hint"> {assignment.assignment_type === "writing" ? "写作" : "口语"}</span>
              </span>
            </label>
          ))
        ) : (
          <p className="hint">还没有发布过作业。</p>
        )}
      </div>
    </div>
  );
}

function LinkedHomework({ label, assignments }: { label: string; assignments: Assignment[] }) {
  if (!assignments.length) return null;
  return (
    <div className="stack">
      <strong>{label}</strong>
      <div className="topic-chip-group">
        {assignments.map((assignment) => (
          <span className="topic-chip" key={assignment.id}>
            {assignment.title}
          </span>
        ))}
      </div>
    </div>
  );
}

function toDateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function StudentPanel({
  students,
  assignments,
  selectedStudentName,
  studentProgress,
  activeArea,
  draft,
  setDraft,
  token,
  hasTeacherAccount,
  setMessage,
  onSaveHomework,
  onSelect,
  onPrepareHomework,
  onAssignHomework,
  onOpenHomework
}: {
  students: StudentProfile[];
  assignments: Assignment[];
  selectedStudentName: string;
  studentProgress: Submission[];
  activeArea: AssignmentType;
  draft: DraftAssignment;
  setDraft: (draft: DraftAssignment) => void;
  token: string;
  hasTeacherAccount: boolean;
  setMessage: (message: string) => void;
  onSaveHomework: (asNew?: boolean) => void;
  onSelect: (studentName: string) => void;
  onPrepareHomework: (studentName: string) => void;
  onAssignHomework: (studentName: string) => void;
  onOpenHomework: (assignment: Assignment, submission?: Submission) => void;
}) {
  const selectedStudent = students.find((student) => normalizeStudentName(student.name) === normalizeStudentName(selectedStudentName));
  const profileTopicHistory = getStudentTopicHistory(assignments, selectedStudentName ? [selectedStudentName] : [], activeArea);
  const homeworkRows = selectedStudentName ? getStudentHomeworkRows(assignments, studentProgress, selectedStudentName, activeArea) : [];
  const assignedSpeakingTopicIds = getSpeakingTopicIdsFromAssignments(
    activeArea === "speaking" && selectedStudentName
      ? assignments.filter((assignment) => assignmentArea(assignment) === "speaking" && assignmentIsVisibleToStudent(assignment, selectedStudentName))
      : []
  );
  const [practiceRows, setPracticeRows] = useState<SpeakingPracticeSubmission[]>([]);
  const [practiceStatus, setPracticeStatus] = useState("");

  useEffect(() => {
    if (activeArea === "speaking" && selectedStudentName) {
      void loadPracticeRows(selectedStudentName);
    } else {
      setPracticeRows([]);
    }
  }, [selectedStudentName, activeArea]);

  async function loadPracticeRows(studentName: string) {
    try {
      const response = await fetch(`/api/teacher/speaking-practice?studentName=${encodeURIComponent(studentName)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPracticeStatus(data.error || `无法加载自主练习。状态码：${response.status}`);
        return;
      }
      setPracticeRows(data.practices || []);
      setPracticeStatus("");
    } catch (error) {
      setPracticeStatus(error instanceof Error ? error.message : "无法加载自主练习。");
    }
  }

  async function savePracticeFeedback(practice: SpeakingPracticeSubmission, patch: PracticeFeedbackDraft) {
    setPracticeStatus("保存中...");
    const response = await fetch("/api/teacher/speaking-practice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        practiceId: practice.id,
        teacherComment: patch.teacherComment,
        fluencyScore: nullableScore(patch.fluencyScore),
        grammarScore: nullableScore(patch.grammarScore),
        vocabularyScore: nullableScore(patch.vocabularyScore),
        recordingComments: patch.recordingComments
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPracticeStatus(data.error || "保存失败。");
      return;
    }
    if (data.practice) setPracticeRows((current) => current.map((item) => (item.id === data.practice.id ? data.practice : item)));
    setPracticeStatus("已保存自主练习批改。");
  }

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>学生情况</h2>
          <div className="hint">打开学生档案后，可以查看{activeArea === "writing" ? "写作" : "口语"}进度和提交记录。</div>
        </div>
        <span className="pill">{students.length} 位学生</span>
      </div>
      <div className="student-profile-layout">
        <aside className="student-profile-sidebar">
          {students.length ? (
            <div className="student-list">
              {students.map((student) => (
                <button
                  className={`student-row ${normalizeStudentName(student.name) === normalizeStudentName(selectedStudentName) ? "active" : ""}`}
                  key={student.id}
                  onClick={() => onSelect(student.name)}
                  type="button"
                >
                  <strong>{student.name}</strong>
                  <span>{student.phone || "暂无手机号"}</span>
                  <span>{student.submission_count || 0} 次提交</span>
                  <span>{student.reviewed_count || 0} 次批改</span>
                  {student.latest_score !== null && student.latest_score !== undefined && (
                    <span className="pill score">{Number(student.latest_score).toFixed(1)}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">还没有学生档案。</p>
          )}
        </aside>

        <section className="student-profile-main">
          {selectedStudentName ? (
            <div className="student-profile">
              <div className="section-head compact">
                <div>
                  <h3>{selectedStudentName}</h3>
                  <div className="hint">
                    {selectedStudent?.phone ? `${selectedStudent.phone} | ` : ""}
                    {homeworkRows.length} 份已发布作业，{studentProgress.length} 次提交。
                  </div>
                </div>
                <button className="btn secondary" type="button" onClick={() => onAssignHomework(selectedStudentName)}>
                  布置作业
                </button>
              </div>
              <LearningProgressPanel submissions={studentProgress} />
              {activeArea === "speaking" && (
                <SpeakingTopicProgressPanel
                  submissions={studentProgress}
                  completedP1TopicIds={[...assignedSpeakingTopicIds.p1, ...getCompletedPracticeTopicIds(practiceRows).p1]}
                  completedP2TopicIds={[...assignedSpeakingTopicIds.p2, ...getCompletedPracticeTopicIds(practiceRows).p2]}
                />
              )}
              {activeArea === "speaking" && (
                <TeacherSpeakingPracticePanel
                  practices={practiceRows}
                  status={practiceStatus}
                  onSave={savePracticeFeedback}
                  onRefresh={() => void loadPracticeRows(selectedStudentName)}
                />
              )}
              <details className="history-card">
                <summary>
                  <div>
                    <h3>给该学生发布作业</h3>
                    <div className="hint">可以直接从学生档案中创建{activeArea === "writing" ? "写作" : "口语"}作业。</div>
                  </div>
                  <span className="pill ok">{activeArea === "writing" ? "写作" : "口语"}</span>
                </summary>
                <div className="stack">
                  <button className="btn secondary" type="button" onClick={() => onPrepareHomework(selectedStudentName)}>
                    为 {selectedStudentName} 新建作业
                  </button>
                  <AssignmentEditor
                    draft={draft}
                    setDraft={setDraft}
                    students={students}
                    activeArea={activeArea}
                    topicHistory={profileTopicHistory}
                    assignedTopicIds={getAssignedTopicIds(assignments, [selectedStudentName], activeArea)}
                    token={token}
                    hasTeacherAccount={hasTeacherAccount}
                    setMessage={setMessage}
                  />
                  <div className="bank-actions">
                    <button className="btn" disabled={!token && !hasTeacherAccount} type="button" onClick={() => onSaveHomework(true)}>
                      发布为新作业
                    </button>
                  </div>
                </div>
              </details>
              <div className="stack">
                <div className="section-head compact">
                  <h3>作业历史</h3>
                  <span className="pill">{homeworkRows.length}</span>
                </div>
                {homeworkRows.length ? (
                  homeworkRows.map((row) => (
                    <button className="submission-row" key={row.key} type="button" onClick={() => onOpenHomework(row.assignment, row.submission)}>
                      <span className="homework-history-title-row">
                        <strong>{row.title}</strong>
                        <span className={`pill compact ${row.status === "reviewed" ? "ok" : row.status === "submitted" ? "warn" : ""}`}>
                          {row.status === "reviewed" ? "已批改" : row.status === "submitted" ? "已提交" : "已发布"}
                        </span>
                      </span>
                      {activeArea === "speaking" ? (
                        <SpeakingTopicLine assignment={row.assignment} />
                      ) : (
                        <WritingTopicLine assignment={row.assignment} />
                      )}
                      <span className="hint">{row.dateLabel}</span>
                    </button>
                  ))
                ) : (
                  <p className="hint">还没有给该学生发布过作业。</p>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>请选择学生</h3>
              <p className="hint">从左侧选择学生后查看学习进度和提交记录。</p>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

type PracticeFeedbackDraft = {
  teacherComment: string;
  fluencyScore: string;
  grammarScore: string;
  vocabularyScore: string;
  recordingComments: Record<string, string>;
};

function TeacherSpeakingPracticePanel({
  practices,
  status,
  onRefresh,
  onSave
}: {
  practices: SpeakingPracticeSubmission[];
  status: string;
  onRefresh: () => void;
  onSave: (practice: SpeakingPracticeSubmission, draft: PracticeFeedbackDraft) => void;
}) {
  return (
    <div className="stack">
      <div className="section-head compact">
        <div>
          <h3>自主口语练习</h3>
          <div className="hint">学生从口语过题情况里自主提交的 P1 或 P2+P3 练习。</div>
        </div>
        <button className="btn secondary" type="button" onClick={onRefresh}>
          刷新
        </button>
      </div>
      {status && <p className="hint">{status}</p>}
      {practices.length ? (
        <div className="practice-review-grid">
          {practices.map((practice) => (
            <TeacherPracticeCard key={practice.id} practice={practice} onSave={onSave} />
          ))}
        </div>
      ) : (
        <p className="hint">该学生还没有提交自主口语练习。</p>
      )}
    </div>
  );
}

function TeacherPracticeCard({
  practice,
  onSave
}: {
  practice: SpeakingPracticeSubmission;
  onSave: (practice: SpeakingPracticeSubmission, draft: PracticeFeedbackDraft) => void;
}) {
  const [draft, setDraft] = useState<PracticeFeedbackDraft>(() => ({
    teacherComment: practice.teacher_comment || "",
    fluencyScore: practice.fluency_score === null || practice.fluency_score === undefined ? "" : String(practice.fluency_score),
    grammarScore: practice.grammar_score === null || practice.grammar_score === undefined ? "" : String(practice.grammar_score),
    vocabularyScore: practice.vocabulary_score === null || practice.vocabulary_score === undefined ? "" : String(practice.vocabulary_score),
    recordingComments: Object.fromEntries((practice.recordings || []).map((recording) => [recording.id, recording.teacher_comment || ""]))
  }));

  useEffect(() => {
    setDraft({
      teacherComment: practice.teacher_comment || "",
      fluencyScore: practice.fluency_score === null || practice.fluency_score === undefined ? "" : String(practice.fluency_score),
      grammarScore: practice.grammar_score === null || practice.grammar_score === undefined ? "" : String(practice.grammar_score),
      vocabularyScore: practice.vocabulary_score === null || practice.vocabulary_score === undefined ? "" : String(practice.vocabulary_score),
      recordingComments: Object.fromEntries((practice.recordings || []).map((recording) => [recording.id, recording.teacher_comment || ""]))
    });
  }, [practice]);

  const items = getPracticeQuestionItems(practice);
  const recordingsByKey = Object.fromEntries((practice.recordings || []).map((recording) => [recording.question_key, recording]));
  const practiceLabel = practice.practice_type === "p1" ? "P1" : "P2+P3";
  const statusLabel = practice.status === "reviewed" ? "已批改" : "待批改";
  const recordingCount = practice.recordings?.length || 0;

  return (
    <details className="practice-review-card">
      <summary className="practice-review-summary">
        <div className="practice-review-summary-top">
          <span className="practice-type-badge">{practiceLabel}</span>
          <span className={`pill ${practice.status === "reviewed" ? "ok" : "warn"}`}>{statusLabel}</span>
        </div>
        <strong className="practice-review-topic">{practice.topic_title}</strong>
        <div className="practice-review-meta">
          <span>{formatDateTime(practice.submitted_at || practice.created_at)}</span>
          <span>{recordingCount} 条录音</span>
          <span>点击查看批改</span>
        </div>
      </summary>
      <div className="practice-review-body">
        {items.map((item) => {
          const recording = recordingsByKey[item.key];
          return (
            <div className="practice-question-card" key={item.key}>
              <div>
                <span className="hint">{item.label}</span>
                <strong>{item.question}</strong>
              </div>
              {recording?.signed_url ? <audio controls src={recording.signed_url} /> : <p className="hint">这题还没有录音。</p>}
              {recording && (
                <div>
                  <label>本题点评</label>
                  <textarea
                    value={draft.recordingComments[recording.id] || ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        recordingComments: { ...current.recordingComments, [recording.id]: event.target.value }
                      }))
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
        <div className="score-grid">
          <div>
            <label>Fluency</label>
            <input value={draft.fluencyScore} onChange={(event) => setDraft({ ...draft, fluencyScore: event.target.value })} />
          </div>
          <div>
            <label>Grammar</label>
            <input value={draft.grammarScore} onChange={(event) => setDraft({ ...draft, grammarScore: event.target.value })} />
          </div>
          <div>
            <label>Vocabulary</label>
            <input value={draft.vocabularyScore} onChange={(event) => setDraft({ ...draft, vocabularyScore: event.target.value })} />
          </div>
        </div>
        <div>
          <label>总评</label>
          <textarea value={draft.teacherComment} onChange={(event) => setDraft({ ...draft, teacherComment: event.target.value })} />
        </div>
        <button className="btn" type="button" onClick={() => onSave(practice, draft)}>
          保存自主练习批改
        </button>
      </div>
    </details>
  );
}

function QuestionInputs({
  title,
  values,
  onChange
}: {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="stack">
      <label>{title}</label>
      {values.map((value, index) => (
        <div className="question-edit-row" key={index}>
          <input
            value={value}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          <button
            className="btn secondary"
            type="button"
            disabled={values.length <= 1}
            onClick={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}
          >
            删除
          </button>
        </div>
      ))}
      <button className="btn ghost" type="button" onClick={() => onChange([...values, ""])}>
        Add question
      </button>
    </div>
  );
}

function WritingTaskInputs({
  tasks,
  token,
  hasTeacherAccount,
  setMessage,
  onChange
}: {
  tasks: WritingTask[];
  token: string;
  hasTeacherAccount: boolean;
  setMessage: (message: string) => void;
  onChange: (tasks: WritingTask[]) => void;
}) {
  const safeTasks = tasks.length ? tasks : [createWritingTask(0)];
  const [uploadingTaskKey, setUploadingTaskKey] = useState("");
  const task1Types = ["折线图", "柱状图", "饼图", "表格", "流程图", "地图"];
  const task2Types = ["单边观点", "双边讨论", "原因分析+观点", "现状分析+观点"];
  const hasTask1 = safeTasks.some((task) => task.key === "writing_task_1");
  const hasTask2 = safeTasks.some((task) => task.key === "writing_task_2");

  function updateTask(index: number, patch: Partial<WritingTask>) {
    onChange(safeTasks.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)));
  }

  async function uploadTaskImage(index: number, file?: File) {
    if (!file) return;
    if (!token && !hasTeacherAccount) {
      setMessage("请先以老师身份登录，再上传图片。");
      return;
    }

    const task = safeTasks[index];
    setUploadingTaskKey(task.key);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch("/api/teacher/writing-image", {
        method: "POST",
        headers,
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Image upload failed.");
      updateTask(index, { image_urls: [...(task.image_urls || []), data.imageUrl] });
      setMessage("Image uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片上传失败。");
    } finally {
      setUploadingTaskKey("");
    }
  }

  return (
    <div className="stack">
      <label>写作任务</label>
      {safeTasks.map((task, index) => {
        const isTask1 = task.key === "writing_task_1";
        const isTask2 = task.key === "writing_task_2";
        return (
        <article className="question-card" key={task.key || index}>
          <div className="two">
            <div>
              <label>任务标题</label>
              <input value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} />
            </div>
            <div>
              <label>字数要求</label>
              <input value={task.word_limit || ""} onChange={(event) => updateTask(index, { word_limit: event.target.value })} />
            </div>
          </div>
          {isTask1 && (
            <div>
              <label>Writing Task 1 类型</label>
              <select value={task.task1_type || ""} onChange={(event) => updateTask(index, { task1_type: event.target.value })}>
                <option value="">选择 Task 1 类型</option>
                {task1Types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isTask2 && (
            <div className="two">
              <div>
                <label>Writing Task 2 类型</label>
                <select value={task.task2_type || ""} onChange={(event) => updateTask(index, { task2_type: event.target.value })}>
                  <option value="">选择 Task 2 类型</option>
                  {task2Types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Writing Task 2 主题</label>
                <input
                  value={task.topic || ""}
                  onChange={(event) => updateTask(index, { topic: event.target.value })}
                  placeholder="例如：教育、科技、环境..."
                />
              </div>
            </div>
          )}
          <div>
            <label>题目要求</label>
            <textarea value={task.prompt} onChange={(event) => updateTask(index, { prompt: event.target.value })} />
          </div>
          {isTask1 && (
            <div className="stack">
              <label>Task 1 图片</label>
              <label className="file-upload">
                {uploadingTaskKey === task.key ? "上传中..." : "上传图片"}
                <input
                  accept="image/*"
                  disabled={uploadingTaskKey === task.key}
                  type="file"
                  onChange={(event) => uploadTaskImage(index, event.target.files?.[0])}
                />
              </label>
              {(task.image_urls || []).length ? (
                <div className="image-preview-grid">
                  {(task.image_urls || []).map((imageUrl) => (
                    <div className="image-preview" key={imageUrl}>
                      <img alt="Writing Task 1 题目图片" src={imageUrl} />
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => updateTask(index, { image_urls: (task.image_urls || []).filter((url) => url !== imageUrl) })}
                      >
                        删除图片
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">可选。适用于 IELTS Writing Task 1 的图表、地图、表格和流程图。</p>
              )}
            </div>
          )}
          <button
            className="btn secondary"
            disabled={safeTasks.length <= 1}
            type="button"
            onClick={() => onChange(safeTasks.filter((_, taskIndex) => taskIndex !== index))}
          >
            删除任务
          </button>
        </article>
        );
      })}
      <div className="bank-actions">
        <button className="btn ghost" disabled={hasTask1} type="button" onClick={() => onChange(sortWritingTasks([...safeTasks, createWritingTask(0)]))}>
          添加 Task 1
        </button>
        <button className="btn ghost" disabled={hasTask2} type="button" onClick={() => onChange(sortWritingTasks([...safeTasks, createWritingTask(1)]))}>
          添加 Task 2
        </button>
      </div>
    </div>
  );
}

function createWritingTask(index: number): WritingTask {
  const taskNumber = index + 1;
  return {
    key: `writing_task_${taskNumber}`,
    label: `Writing Task ${taskNumber}`,
    title: `Writing Task ${taskNumber}`,
    prompt: "",
    word_limit: taskNumber === 1 ? "150+ words" : "250+ words",
    task1_type: taskNumber === 1 ? "" : undefined,
    task2_type: taskNumber === 2 ? "" : undefined,
    topic: taskNumber === 2 ? "" : undefined,
    image_urls: taskNumber === 1 ? [] : undefined
  };
}

function sortWritingTasks(tasks: WritingTask[]) {
  return [...tasks].sort((a, b) => writingTaskOrder(a.key) - writingTaskOrder(b.key));
}

function writingTaskOrder(key: string) {
  if (key === "writing_task_1") return 1;
  if (key === "writing_task_2") return 2;
  return 99;
}

function RecordingList({
  recordings,
  questionItems,
  feedback,
  updateDetail,
  transcribingId,
  savingTranscriptId,
  onTranscribe,
  onTranscriptChange,
  onTranscriptSave,
  uploadingDemoId,
  onDemoUpload
}: {
  recordings: Recording[];
  questionItems: QuestionItem[];
  feedback: Feedback;
  updateDetail: (index: number, patch: Partial<FeedbackDetail>) => void;
  transcribingId: string;
  savingTranscriptId: string;
  onTranscribe: (recordingId: string) => void;
  onTranscriptChange: (recordingId: string, transcript: string) => void;
  onTranscriptSave: (recordingId: string, transcript: string) => void;
  uploadingDemoId: string;
  onDemoUpload: (recordingId: string, file?: File, duration?: number) => void;
}) {
  const comments = questionCommentDetails(feedback.details || []);
  const recordingsByKey = new Map(recordings.map((recording) => [recording.question_key, recording]));
  const reviewItems = questionItems.length
    ? questionItems
    : recordings.map((recording) => ({
        key: recording.question_key,
        part: recording.question_key === "p2" ? "p2" : recording.question_key.startsWith("p3") ? "p3" : "p1",
        label: recording.question_label,
        question: recording.question_text
      })) as QuestionItem[];

  return (
    <div className="stack">
      <label>录音</label>
      {reviewItems.map((item) => {
        const recording = recordingsByKey.get(item.key);
        const comment = comments.find((detail) => detail.part === `comment:${item.key}`);
        const commentIndex = feedback.details.findIndex((detail) => detail.part === comment?.part);
        const editedTranscript = recording ? recording.corrected_transcript_text || recording.transcript_text || "" : "";

        return (
          <article className="question-card" key={recording?.id || item.key}>
            <div>
              <div className="hint">
                {recording ? `${recording.question_label} | ${formatTime(recording.duration_seconds)}` : item.label}
              </div>
              <div className="question-title">{recording?.question_text || item.question}</div>
            </div>
            {recording ? (
              <>
                {recording.signed_url ? <audio controls src={recording.signed_url} /> : <p className="hint">录音链接暂时不可用。</p>}
                <div className="transcript-editor">
                  <div className="section-head compact">
                    <div>
                      <label>录音转写</label>
                      <div className="hint">生成转写后可以修改并保存。发布批改后，学生会看到转写和修改痕迹。</div>
                    </div>
                    <button
                      className="btn secondary"
                      disabled={transcribingId === recording.id}
                      onClick={() => onTranscribe(recording.id)}
                      type="button"
                    >
                      {transcribingId === recording.id
                        ? "生成中..."
                        : recording.transcript_text
                          ? "重新生成转写"
                          : "生成转写"}
                    </button>
                  </div>
                  {recording.transcript_text ? (
                    <TranscriptWorkspace
                      recordingId={recording.id}
                      originalTranscript={recording.transcript_text}
                      editedTranscript={editedTranscript}
                      commentValue={comment?.comment || ""}
                      savingTranscript={savingTranscriptId === recording.id}
                      onTranscriptChange={onTranscriptChange}
                      onTranscriptSave={onTranscriptSave}
                      onCommentChange={(next) => commentIndex >= 0 && updateDetail(commentIndex, { comment: next })}
                    />
                  ) : (
                    <p className="hint">还没有转写。</p>
                  )}
                </div>
                <div className="transcript-editor">
                  <div className="section-head compact">
                    <div>
                      <label>示范回答</label>
                      <div className="hint">可以在这里直接录制老师示范回答。发布批改后，学生可以播放参考。</div>
                    </div>
                  </div>
                  <TeacherDemoRecorder
                    recordingId={recording.id}
                    disabled={uploadingDemoId === recording.id}
                    onSave={onDemoUpload}
                  />
                  {recording.teacher_demo?.signed_url ? (
                    <audio controls src={recording.teacher_demo.signed_url} />
                  ) : (
                    <p className="hint">还没有示范回答。</p>
                  )}
                </div>
              </>
            ) : (
              <div className="transcript-editor">
                <span className="pill warn">缺少录音</span>
                <p className="hint">这个问题还没有上传录音。请学生重新打开作业并再次保存这一题。</p>
              </div>
            )}
            {comment && (
              <div className="inline-comment">
                <label>本题整体点评</label>
                <textarea
                  value={parseReviewComment(comment.comment).general}
                  onChange={(event) =>
                    updateDetail(commentIndex, {
                      comment: stringifyReviewComment({
                        ...parseReviewComment(comment.comment),
                        general: event.target.value
                      })
                    })
                  }
                />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/**
 * The transcript and the notes on it, side by side.
 *
 * One textarea serves both jobs: the teacher edits the transcript in it, and
 * selecting a passage there is what a note attaches to. An earlier version had
 * a separate read-only copy to select from, which meant the same text appeared
 * twice and only one copy was editable.
 */
function TranscriptWorkspace({
  recordingId,
  originalTranscript,
  editedTranscript,
  commentValue,
  savingTranscript,
  onTranscriptChange,
  onTranscriptSave,
  onCommentChange
}: {
  recordingId: string;
  originalTranscript: string;
  editedTranscript: string;
  commentValue: string;
  savingTranscript: boolean;
  onTranscriptChange: (recordingId: string, value: string) => void;
  onTranscriptSave: (recordingId: string, value: string) => void;
  onCommentChange: (value: string) => void;
}) {
  const selectionRef = useRef({ start: 0, end: 0 });
  const review = parseReviewComment(commentValue);

  function update(patch: Partial<ReviewComment>) {
    onCommentChange(stringifyReviewComment({ ...review, ...patch }));
  }

  function addInlineComment() {
    const { start, end } = selectionRef.current;
    const selection = editedTranscript.slice(start, end).trim();
    if (!selection) {
      window.alert("请先在转写里选中要批注的文字。");
      return;
    }
    const note = window.prompt(`批注「${selection.slice(0, 40)}${selection.length > 40 ? "..." : ""}」：`);
    if (!note?.trim()) return;
    update({
      inlineComments: [...review.inlineComments, { id: newInlineCommentId(), quote: selection, comment: note.trim() }]
    });
  }

  return (
    <div className="speaking-review-workspace">
      <div className="speaking-review-main">
        <div className="section-head compact">
          <div>
            <label>录音转写（审阅模式）</label>
            <div className="hint">
              直接修改文字，改动会实时标记：绿色为新增，红色删除线为删去。选中一段后点「添加批注」。
            </div>
          </div>
          <div className="bank-actions">
            {/* Keeps focus on the editor so the selection survives the click. */}
            <button
              className="btn secondary"
              onMouseDown={(event) => event.preventDefault()}
              onClick={addInlineComment}
              type="button"
            >
              添加批注
            </button>
            <button
              className="btn secondary"
              disabled={savingTranscript}
              onClick={() => onTranscriptSave(recordingId, editedTranscript)}
              type="button"
            >
              {savingTranscript ? "保存中..." : "保存转写修改"}
            </button>
          </div>
        </div>
        <TrackedTextEditor
          className="speaking-transcript-editor"
          original={originalTranscript}
          value={editedTranscript}
          onChange={(next) => onTranscriptChange(recordingId, next)}
          onSelectionChange={(selection) => {
            selectionRef.current = selection;
          }}
        />
      </div>

      <aside className="speaking-comment-sidebar">
        <div className="section-head compact">
          <label>批注</label>
          <span className="pill">{review.inlineComments.length}</span>
        </div>
        {review.inlineComments.length ? (
          review.inlineComments.map((item) => (
            <div className="inline-comment-card" key={item.id}>
              <blockquote>{item.quote}</blockquote>
              <textarea
                value={item.comment}
                onChange={(event) =>
                  update({
                    inlineComments: review.inlineComments.map((existing) =>
                      existing.id === item.id ? { ...existing, comment: event.target.value } : existing
                    )
                  })
                }
              />
              <button
                className="btn link"
                type="button"
                onClick={() =>
                  update({ inlineComments: review.inlineComments.filter((existing) => existing.id !== item.id) })
                }
              >
                删除
              </button>
            </div>
          ))
        ) : (
          <p className="hint">在左侧转写里选中文字即可添加批注。</p>
        )}
      </aside>
    </div>
  );
}

function TeacherDemoRecorder({
  recordingId,
  disabled,
  onSave
}: {
  recordingId: string;
  disabled: boolean;
  onSave: (recordingId: string, file?: File, duration?: number) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const [active, setActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function toggle() {
    if (active) {
      setProcessing(true);
      recorderRef.current?.stop();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setActive(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持网页录音。请使用 Chrome、Edge 或 Safari。");
      return;
    }

    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("麦克风权限被阻止。请允许麦克风权限后重试。");
      return;
    }

    const mimeType = getSupportedTeacherAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setSeconds(0);

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blobType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: blobType });
      const duration = Math.max(elapsedRef.current, seconds);
      if (!blob.size) {
        setError("录音内容为空，请重新录制。");
        setProcessing(false);
        return;
      }
      const file = new File([blob], `teacher-sample.${audioExtension(blob.type)}`, { type: blob.type });
      onSave(recordingId, file, duration);
      setProcessing(false);
    };

    recorder.start(1000);
    setActive(true);
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setSeconds(elapsedRef.current);
    }, 1000);
  }

  return (
    <div className="recorder-row">
      <button className={`btn ${active ? "danger" : "secondary"}`} disabled={disabled || processing} onClick={toggle} type="button">
        {disabled ? "保存中..." : active ? "停止示范录音" : processing ? "准备中..." : "录制示范回答"}
      </button>
      <span className="timer">{formatTime(seconds)}</span>
      {error ? <span className="error">{error}</span> : <span className="hint">可以直接在本页面录制。</span>}
    </div>
  );
}

function WritingResponseList({
  responses,
  tasks,
  feedback,
  savingWritingId,
  updateDetail,
  onRevisionChange,
  onRevisionSave
}: {
  responses: WritingResponse[];
  tasks: WritingTask[];
  feedback: Feedback;
  savingWritingId: string;
  updateDetail: (index: number, patch: Partial<FeedbackDetail>) => void;
  onRevisionChange: (responseId: string, revision: string) => void;
  onRevisionSave: (responseId: string, revision: string) => void;
}) {
  const comments = questionCommentDetails(feedback.details || []);

  return (
    <div className="stack">
      <label>作文提交</label>
      {responses.length ? (
        responses.map((response) => {
          const comment = comments.find((detail) => detail.part === `comment:${response.task_key}`);
          const commentIndex = feedback.details.findIndex((detail) => detail.part === comment?.part);
          const editedText = response.teacher_revision_text || response.response_text || "";
          const taskImages = tasks.find((task) => task.key === response.task_key)?.image_urls || [];

          return (
            <article className="question-card" key={response.id}>
              <div>
                <div className="hint">{response.task_label}</div>
                <div className="question-title">{response.task_title}</div>
                {taskImages.length ? <TaskImageGrid imageUrls={taskImages} /> : null}
                <p className="hint">{response.task_prompt}</p>
              </div>
              <div className="writing-review-grid">
                <div>
                  <label>学生作文</label>
                  <div className="writing-text">{response.response_text}</div>
                </div>
                <div>
                  <label>老师修改版本</label>
                  <textarea value={editedText} onChange={(event) => onRevisionChange(response.id, event.target.value)} />
                </div>
              </div>
              <button
                className="btn secondary"
                disabled={savingWritingId === response.id}
                onClick={() => onRevisionSave(response.id, editedText)}
                type="button"
              >
                {savingWritingId === response.id ? "保存中..." : "保存作文修改"}
              </button>
              <TranscriptDiff original={response.response_text} edited={editedText} />
              {comment && (
                <div className="inline-comment">
                  <label>本题点评</label>
                  <textarea
                    value={comment.comment}
                    onChange={(event) => updateDetail(commentIndex, { comment: event.target.value })}
                  />
                </div>
              )}
            </article>
          );
        })
      ) : (
        <p className="hint">学生还没有提交作文。</p>
      )}
    </div>
  );
}

function WritingReviewModeList({
  responses,
  tasks,
  feedback,
  savingWritingId,
  updateDetail,
  onRevisionChange,
  onRevisionSave
}: {
  responses: WritingResponse[];
  tasks: WritingTask[];
  feedback: Feedback;
  savingWritingId: string;
  updateDetail: (index: number, patch: Partial<FeedbackDetail>) => void;
  onRevisionChange: (responseId: string, revision: string) => void;
  onRevisionSave: (responseId: string, revision: string) => void;
}) {
  const comments = questionCommentDetails(feedback.details || []);

  return (
    <div className="stack">
      <div>
        <h3>作文审阅</h3>
        <p className="hint">直接在学生作文上修改；下方会显示修订痕迹，也可以选中文字后添加批注。</p>
      </div>
      {responses.length ? (
        responses.map((response) => {
          const comment = comments.find((detail) => detail.part === `comment:${response.task_key}`);
          const commentIndex = feedback.details.findIndex((detail) => detail.part === comment?.part);
          const taskImages = tasks.find((task) => task.key === response.task_key)?.image_urls || [];

          return (
            <WritingReviewEditor
              key={response.id}
              response={response}
              imageUrls={taskImages}
              commentValue={comment?.comment || ""}
              commentIndex={commentIndex}
              savingWritingId={savingWritingId}
              updateDetail={updateDetail}
              onRevisionChange={onRevisionChange}
              onRevisionSave={onRevisionSave}
            />
          );
        })
      ) : (
        <p className="hint">学生还没有提交作文。</p>
      )}
    </div>
  );
}

function WritingReviewEditor({
  response,
  imageUrls,
  commentValue,
  commentIndex,
  savingWritingId,
  updateDetail,
  onRevisionChange,
  onRevisionSave
}: {
  response: WritingResponse;
  imageUrls: string[];
  commentValue: string;
  commentIndex: number;
  savingWritingId: string;
  updateDetail: (index: number, patch: Partial<FeedbackDetail>) => void;
  onRevisionChange: (responseId: string, revision: string) => void;
  onRevisionSave: (responseId: string, revision: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editedText = response.teacher_revision_text || response.response_text || "";
  const reviewComment = parseReviewComment(commentValue);

  function updateReviewComment(patch: Partial<{ general: string; inlineComments: InlineComment[] }>) {
    if (commentIndex < 0) return;
    updateDetail(commentIndex, {
      comment: stringifyReviewComment({
        ...reviewComment,
        ...patch
      })
    });
  }

  function addInlineComment() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const quote = editedText.slice(start, end).trim();
    if (!quote) {
      window.alert("请先在作文里选中需要批注的文字。");
      return;
    }
    const comment = window.prompt("请输入批注内容：");
    if (!comment?.trim()) return;
    updateReviewComment({
      inlineComments: [
        ...reviewComment.inlineComments,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          quote,
          comment: comment.trim()
        }
      ]
    });
  }

  function updateInlineComment(id: string, patch: Partial<InlineComment>) {
    updateReviewComment({
      inlineComments: reviewComment.inlineComments.map((item) => (item.id === id ? { ...item, ...patch } : item))
    });
  }

  function deleteInlineComment(id: string) {
    updateReviewComment({
      inlineComments: reviewComment.inlineComments.filter((item) => item.id !== id)
    });
  }

  return (
    <article className="question-card writing-review-editor-card">
      <div>
        <div className="hint">{response.task_label}</div>
        <div className="question-title">{response.task_title}</div>
        {imageUrls.length ? <TaskImageGrid imageUrls={imageUrls} /> : null}
        <p className="hint">{response.task_prompt}</p>
      </div>

      <div className="writing-review-workspace">
        <div className="writing-review-main">
          <div className="section-head compact">
            <div>
              <label>修订</label>
              <div className="hint">在下方作文框中直接修改学生原文。</div>
            </div>
            <div className="segmented compact-segmented">
              <button className="btn secondary" onClick={addInlineComment} type="button">
                添加批注
              </button>
              <button
                className="btn secondary"
                disabled={savingWritingId === response.id}
                onClick={() => onRevisionSave(response.id, editedText)}
                type="button"
              >
                {savingWritingId === response.id ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            className="writing-review-editor"
            value={editedText}
            onChange={(event) => onRevisionChange(response.id, event.target.value)}
          />
          <TranscriptDiff original={response.response_text} edited={editedText} />
          <div className="inline-comment">
            <label>本题总点评</label>
            <textarea
              value={reviewComment.general}
              onChange={(event) => updateReviewComment({ general: event.target.value })}
            />
          </div>
        </div>

        <aside className="writing-comment-sidebar">
          <div className="section-head compact">
            <label>批注</label>
            <span className="pill">{reviewComment.inlineComments.length}</span>
          </div>
          {reviewComment.inlineComments.length ? (
            reviewComment.inlineComments.map((item, index) => (
              <div className="writing-comment-bubble" key={item.id}>
                <div className="comment-anchor">批注 {index + 1}</div>
                <blockquote>{item.quote}</blockquote>
                <textarea
                  value={item.comment}
                  onChange={(event) => updateInlineComment(item.id, { comment: event.target.value })}
                />
                <button className="btn secondary compact-button" onClick={() => deleteInlineComment(item.id)} type="button">
                  删除批注
                </button>
              </div>
            ))
          ) : (
            <p className="hint">选中作文中的文字后，点击“添加批注”。</p>
          )}
        </aside>
      </div>
    </article>
  );
}

function WritingStudentResponseList({ responses, tasks }: { responses: WritingResponse[]; tasks: WritingTask[] }) {
  return (
    <div className="writing-grading-column">
      <div>
        <h3>学生作文</h3>
        <p className="hint">左侧显示学生提交的原文和题目。</p>
      </div>
      {responses.length ? (
        responses.map((response) => {
          const taskImages = tasks.find((task) => task.key === response.task_key)?.image_urls || [];

          return (
            <article className="question-card" key={response.id}>
              <div className="hint">{response.task_label}</div>
              <div className="question-title">{response.task_title}</div>
              {taskImages.length ? <TaskImageGrid imageUrls={taskImages} /> : null}
              <p className="hint">{response.task_prompt}</p>
              <label>学生原文</label>
              <div className="writing-text large">{response.response_text}</div>
            </article>
          );
        })
      ) : (
        <p className="hint">学生还没有提交作文。</p>
      )}
    </div>
  );
}

function WritingTeacherReviewList({
  responses,
  feedback,
  savingWritingId,
  updateDetail,
  onRevisionChange,
  onRevisionSave
}: {
  responses: WritingResponse[];
  feedback: Feedback;
  savingWritingId: string;
  updateDetail: (index: number, patch: Partial<FeedbackDetail>) => void;
  onRevisionChange: (responseId: string, revision: string) => void;
  onRevisionSave: (responseId: string, revision: string) => void;
}) {
  const comments = questionCommentDetails(feedback.details || []);

  return (
    <div className="writing-grading-column">
      <div>
        <h3>老师批改</h3>
        <p className="hint">右侧修改学生作文，并填写每题点评。</p>
      </div>
      {responses.length ? (
        responses.map((response) => {
          const comment = comments.find((detail) => detail.part === `comment:${response.task_key}`);
          const commentIndex = feedback.details.findIndex((detail) => detail.part === comment?.part);
          const editedText = response.teacher_revision_text || response.response_text || "";

          return (
            <article className="question-card" key={response.id}>
              <div className="hint">{response.task_label}</div>
              <div className="question-title">{response.task_title}</div>
              <label>老师修改版本</label>
              <textarea
                className="writing-revision-editor"
                value={editedText}
                onChange={(event) => onRevisionChange(response.id, event.target.value)}
              />
              <button
                className="btn secondary"
                disabled={savingWritingId === response.id}
                onClick={() => onRevisionSave(response.id, editedText)}
                type="button"
              >
                {savingWritingId === response.id ? "保存中..." : "保存作文修改"}
              </button>
              <TranscriptDiff original={response.response_text} edited={editedText} />
              {comment && (
                <div className="inline-comment">
                  <label>本题点评</label>
                  <textarea
                    value={comment.comment}
                    onChange={(event) => updateDetail(commentIndex, { comment: event.target.value })}
                  />
                </div>
              )}
            </article>
          );
        })
      ) : (
        <p className="hint">学生还没有提交作文。</p>
      )}
    </div>
  );
}

function TaskImageGrid({ imageUrls }: { imageUrls: string[] }) {
  return (
    <div className="task-image-grid">
      {imageUrls.map((imageUrl) => (
        <img alt="写作 Task 1 题目图片" className="task-image" key={imageUrl} src={imageUrl} />
      ))}
    </div>
  );
}

function FeedbackEditor({
  feedback,
  updateComment,
  updateDetail,
  publish
}: {
  feedback: Feedback;
  updateComment: (value: string) => void;
  updateDetail: (index: number, patch: Partial<FeedbackDetail>) => void;
  publish: () => void;
}) {
  const scores = scoreDetails(feedback.details || []);
  const average = averageScore(scores);

  return (
    <div className="stack">
      <div className="overall">
        <div className="overall-score">
          <span>平均分</span>
          <strong>{average.toFixed(1)}</strong>
        </div>
        <label>总评</label>
        <textarea value={feedback.overall_comment} onChange={(event) => updateComment(event.target.value)} />
      </div>
      <div className="stack">
        <label>评分区</label>
        {scores.map((detail) => {
          const index = feedback.details.findIndex((item) => item.part === detail.part);
          return (
          <article className="detail-item" key={detail.part}>
            <div className="detail-head">
              <strong>{detail.label}</strong>
              <input
                className="detail-score"
                type="number"
                min="0"
                max="9"
                step=".5"
                value={detail.score}
                onChange={(event) => updateDetail(index, { score: Number(event.target.value) })}
              />
            </div>
            <p className="hint">{detail.question}</p>
          </article>
          );
        })}
      </div>
      <button className="btn" onClick={publish} type="button">
        发布批改
      </button>
    </div>
  );
}

function getPracticeQuestionItems(practice: SpeakingPracticeSubmission) {
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

function nullableScore(value: string) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function formatTime(total: number) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getSupportedTeacherAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}
