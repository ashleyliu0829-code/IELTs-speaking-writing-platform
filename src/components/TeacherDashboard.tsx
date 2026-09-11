"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Assignment, AssignmentType, Feedback, FeedbackDetail, QuestionItem, Recording, SpeakingPracticeSubmission, StudentProfile, Submission, WritingResponse, WritingTask } from "@/lib/types";
import { mergeFeedbackDetails, questionCommentDetails, scoreDetails } from "@/lib/feedback";
import { currentP1Bank, currentP2P3Bank, p1QuestionBank, p2P3QuestionBank } from "@/lib/questionBank";
import { LessonProgressPanel } from "@/components/LessonProgress";
import { averageScore, defaultAssignment, defaultWritingAssignment, getQuestionItems } from "@/lib/questions";
import { LearningProgressPanel } from "@/components/LearningProgress";
import { TeacherSchedulePanel } from "@/components/LessonScheduler";
import { SpeakingTopicProgressPanel } from "@/components/SpeakingTopicProgress";
import { TeacherDailyTasksPanel } from "@/components/DailyTasks";
import { StudentOverviewPanel } from "@/components/StudentOverview";
import { tr, useLanguage } from "@/lib/i18n";
import { TeacherHomePanels } from "@/components/TeacherHome";
import { TranscriptDiff } from "@/components/TranscriptDiff";
import { TrackedTextEditor } from "@/components/TrackedTextEditor";
import { getSpeakingTopicIdsFromAssignments } from "@/lib/speakingProgress";
import { newInlineCommentId, parseReviewComment, stringifyReviewComment, type InlineComment, type ReviewComment } from "@/lib/reviewComments";
import homeworkIcon from "../../public/icons/workspace-homework.png";
import lessonSchedulingIcon from "../../public/icons/workspace-lesson-scheduling.png";
import studentProfileIcon from "../../public/icons/Student profile.png";

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

type TeacherSection =
  | "studentOverview"
  | "studentInvite"
  | "assignments"
  | "grading"
  | "schedule"
  | "lessonRecording"
  | "dailyTasks";

export function TeacherDashboard() {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authPhone, setAuthPhone] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [activeArea, setActiveArea] = useState<AssignmentType>("speaking");
  const [teacherSection, setTeacherSection] = useState<TeacherSection>("assignments");
  const [navLevel, setNavLevel] = useState<"root" | "detail">("root");
  // Grading opens on the student list; a jump straight to a submission flips it.
  const [gradingView, setGradingView] = useState<"students" | "submissions">("students");
  const [assignmentView, setAssignmentView] = useState<"history" | "new">("new");
  const [publishSearch, setPublishSearch] = useState("");
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
  const { language: teacherLanguage, t } = useLanguage();
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
    void loadCurrentAccount();
  }, []);

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
    if (!response.ok) throw new Error(data.error || tr("请求失败。", "Request failed."));
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
      setMessage(tr("工作台已加载。", "Workspace loaded."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("加载失败。", "Could not load."));
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
      setMessage(error instanceof Error ? error.message : tr("学生情况加载失败。", "Could not load student profiles."));
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
      if (!response.ok) throw new Error(data.error || tr("账号请求失败。", "Account request failed."));
      setAccount(data.account);
      setToken("");
      setMessage(tr("老师账号已准备好。", "Teacher account ready."));
      await loadAssignments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("账号请求失败。", "Account request failed."));
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
    setMessage(tr("已退出登录。", "Signed out."));
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
      setMessage(asNew ? tr("新作业已保存。", "New homework saved.") : tr("作业已保存。", "Homework saved."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("保存失败。", "Could not save."));
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
      setMessage(tr("AI 反馈草稿已生成。", "AI feedback draft ready."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("AI 分析失败。", "AI analysis failed."));
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
      setMessage(tr("批改已发布。", "Feedback published."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("发布失败。", "Could not publish."));
    }
  }

  async function deleteSubmission() {
    if (!selectedSubmission) return;
    const confirmed = window.confirm(tr(`确定删除 ${selectedSubmission.student_name} 的提交和全部录音吗？`, `Delete ${selectedSubmission.student_name}'s submission and all its recordings?`));
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
      setMessage(tr("提交已删除。", "Submission deleted."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("删除失败。", "Could not delete."));
    } finally {
      setLoading(false);
    }
  }

  async function deleteAssignment(assignment: Assignment) {
    const stats = assignmentStats(assignment.id);
    const confirmed = window.confirm(
      stats.submitted
        ? tr(`确定从作业列表隐藏“${assignment.title}”吗？已有的 ${stats.submitted} 份学生提交会保留。`, `Hide "${assignment.title}" from the homework list? The ${stats.submitted} existing submissions are kept.`)
        : tr(`确定从作业列表隐藏“${assignment.title}”吗？`, `Hide "${assignment.title}" from the homework list?`)
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
      setMessage(tr("作业已从发布列表隐藏。", "Homework hidden from the list."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("删除作业失败。", "Could not delete the homework."));
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
    setTeacherSection("assignments");
    setNavLevel("detail");
  }

  function openGrading(area: AssignmentType) {
    switchArea(area);
    setTeacherSection("grading");
    setGradingView("students");
    setNavLevel("detail");
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
      if (!response.ok) throw new Error(data.error || tr("激活失败。", "Activation failed."));
      setActivationCode("");
      // Re-read the session so activated_at is present and the workspace opens.
      await loadCurrentAccount();
      setMessage(tr("激活成功，可以开始使用了。", "Activated — you're all set."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("激活失败。", "Activation failed."));
    } finally {
      setActivating(false);
    }
  }

  // Which index entry is lit. A homework section belongs to whichever area
  // is open, which is why speaking and writing cannot share one test.
  function atSection(section: TeacherSection) {
    return navLevel === "detail" && teacherSection === section;
  }

  const isPublishingSection = navLevel === "detail" && teacherSection === "assignments";
  const isGradingSection = navLevel === "detail" && teacherSection === "grading";

  function openStudentInvite() {
    setTeacherSection("studentInvite");
    setNavLevel("detail");
  }

  function openStudentOverview() {
    setTeacherSection("studentOverview");
    setNavLevel("detail");
  }

  // From a row in the overview into that student's own homework history. The
  // overview is workspace-wide; the panel it opens is per-area, so it lands on
  // whichever area the teacher last had open.
  function openStudentFromOverview(studentName: string) {
    setTeacherSection("grading");
    setGradingView("students");
    setNavLevel("detail");
    void loadStudentProgress(studentName);
  }

  function openSchedule() {
    setTeacherSection("schedule");
    setNavLevel("detail");
  }

  function openLessonRecording() {
    setTeacherSection("lessonRecording");
    setNavLevel("detail");
  }

  function openDailyTasks() {
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
    setMessage(tr(`已为 ${studentName} 开始创建新的${activeArea === "writing" ? "写作" : "口语"}作业。`, `Started a new ${activeArea} homework for ${studentName}.`));
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
      setMessage(tr("转写已生成。", "Transcript ready."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("转写失败。", "Transcription failed."));
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
      setMessage(tr("转写修改已保存。", "Transcript edits saved."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("保存转写失败。", "Could not save the transcript."));
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
      if (!response.ok) throw new Error(data.error || tr("示范回答保存失败。", "Could not save the sample answer."));

      patchRecording(recordingId, { teacher_demo: data.demo || null });
      setMessage(tr("示范回答已保存。", "Sample answer saved."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("示范回答保存失败。", "Could not save the sample answer."));
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
      setMessage(tr("作文修改已保存。", "Essay edits saved."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("作文修改保存失败。", "Could not save the essay edits."));
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
      setGradingView("submissions");
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
            {message && <p className={message.includes("成功") || message.startsWith("Activated") ? "hint" : "error"}>{message}</p>}
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
    <main className="shell shell-wide">
      {hasTeacherAccess && (
        <div className="home-layout">
          {/* The index stays put. Everything it opens renders in the pane on
              the right, so the teacher never loses their place in the list. */}
          <nav className="home-nav" aria-label={t("工作区", "Workspaces")}>
            <button
              className={`home-nav-home ${navLevel === "root" ? "active" : ""}`}
              type="button"
              onClick={() => setNavLevel("root")}
            >
              {t("工作台", "Dashboard")}
            </button>

            <div className="home-nav-group">
              <strong className="home-nav-title">
                <img src={homeworkIcon.src} alt="" />
                {t("作业布置", "Homework")}
              </strong>
              <button
                className={`home-nav-item ${isPublishingSection && activeArea === "speaking" ? "active" : ""}`}
                type="button"
                onClick={() => openArea("speaking")}
              >
                {t("口语", "Speaking")}
              </button>
              <button
                className={`home-nav-item ${isPublishingSection && activeArea === "writing" ? "active" : ""}`}
                type="button"
                onClick={() => openArea("writing")}
              >
                {t("写作", "Writing")}
              </button>
              <button
                className={`home-nav-item ${atSection("dailyTasks") ? "active" : ""}`}
                type="button"
                onClick={openDailyTasks}
              >
                {t("每日任务", "Daily tasks")}
              </button>
            </div>

            <div className="home-nav-group">
              <strong className="home-nav-title">
                {/* Drawn inline rather than imported: the icon set has no
                    marking icon, and a mismatched one is worse than none. */}
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
                  <path
                    d="M4.5 2.5h8l3 3v12h-11z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 11.4l2.2 2.2 4.3-4.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t("作业批改", "Grading")}
              </strong>
              <button
                className={`home-nav-item ${isGradingSection && activeArea === "speaking" ? "active" : ""}`}
                type="button"
                onClick={() => openGrading("speaking")}
              >
                {t("口语", "Speaking")}
              </button>
              <button
                className={`home-nav-item ${isGradingSection && activeArea === "writing" ? "active" : ""}`}
                type="button"
                onClick={() => openGrading("writing")}
              >
                {t("写作", "Writing")}
              </button>
            </div>

            <div className="home-nav-group">
              <strong className="home-nav-title">
                <img src={lessonSchedulingIcon.src} alt="" />
                {t("排课管理", "Scheduling")}
              </strong>
              <button
                className={`home-nav-item ${atSection("schedule") ? "active" : ""}`}
                type="button"
                onClick={openSchedule}
              >
                {t("排课", "Schedule")}
              </button>
              <button
                className={`home-nav-item ${atSection("lessonRecording") ? "active" : ""}`}
                type="button"
                onClick={openLessonRecording}
              >
                {t("课程进度", "Progress")}
              </button>
            </div>

            <div className="home-nav-group">
              <strong className="home-nav-title">
                <img src={studentProfileIcon.src} alt="" />
                {t("学生档案", "Student archive")}
              </strong>
              <button
                className={`home-nav-item ${atSection("studentOverview") ? "active" : ""}`}
                type="button"
                onClick={openStudentOverview}
              >
                {t("总览", "Overview")}
              </button>
              <button
                className={`home-nav-item ${atSection("studentInvite") ? "active" : ""}`}
                type="button"
                onClick={openStudentInvite}
              >
                {t("学生注册", "Student sign-up")}
              </button>
            </div>

            <div className="home-nav-foot">
              <UsagePanel language={teacherLanguage} />
              {account && (
                <button className="home-nav-logout" onClick={logout} type="button">
                  {t("退出登录", "Log out")}
                </button>
              )}
            </div>
          </nav>

          <div className="home-main">
            <div className="dashboard-actions">
              <button className="btn secondary" onClick={loadAssignments} disabled={loading} type="button">
                {loading ? t("加载中...", "Loading...") : t("刷新", "Refresh")}
              </button>
            </div>
            {message && (
              <p className={message.includes("failed") || message.includes("Unauthorized") ? "error" : "hint"}>{message}</p>
            )}
      {navLevel === "root" && (
        <TeacherHomePanels
          onOpenSchedule={openSchedule}
          onOpenGrading={() => {
            setTeacherSection("grading");
            setGradingView("submissions");
            setNavLevel("detail");
          }}
        />
      )}

      {hasTeacherAccess && navLevel === "detail" && (
        <div className="crumb-bar">
          {teacherSection === "schedule" || teacherSection === "lessonRecording" ? (
            <span className="pill">{t("排课管理", "Scheduling")}</span>
          ) : teacherSection === "studentOverview" || teacherSection === "studentInvite" ? (
            <span className="pill">{t("学生档案", "Student archive")}</span>
          ) : teacherSection === "dailyTasks" ? (
            <span className="pill">{t("作业布置", "Homework")}</span>
          ) : teacherSection === "grading" ? (
            <>
              <span className="pill">{t("作业批改", "Grading")}</span>
              <span className="pill ok">{activeArea === "writing" ? t("写作", "Writing") : t("口语", "Speaking")}</span>
            </>
          ) : (
            <>
              <span className="pill">{t("作业布置", "Homework")}</span>
              <span className="pill ok">{activeArea === "writing" ? t("写作", "Writing") : t("口语", "Speaking")}</span>
            </>
          )}
          {teacherSection !== "grading" && teacherSection !== "assignments" && (
            <span className="pill">{sectionLabel(teacherSection, teacherLanguage)}</span>
          )}
        </div>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "studentInvite" && (
        <section className="single-column">
          <article className="card stack">
            <div>
              <h2>{t("学生注册", "Student sign-up")}</h2>
              <p className="hint">
                {t(
                  "把这个链接发给学生，他们打开后自己注册，注册好就直接进入你的班级，不需要你再手动添加。",
                  "Send this link to a student. They sign up themselves and land in your workspace — nothing for you to add by hand."
                )}
              </p>
            </div>
            <div className="question-card">
              <label>{t("注册链接", "Sign-up link")}</label>
              <input value={studentInviteLink} readOnly onFocus={(event) => event.currentTarget.select()} />
              <button className="btn secondary" type="button" onClick={() => navigator.clipboard.writeText(studentInviteLink)}>
                {t("复制链接", "Copy link")}
              </button>
            </div>
          </article>
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "studentOverview" && (
        <section className="single-column">
          <StudentOverviewPanel onOpenStudent={openStudentFromOverview} />
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "grading" && (
        <section className="single-column">
          <div className="segmented">
            <button className={`btn ${gradingView === "students" ? "" : "secondary"}`} onClick={() => setGradingView("students")} type="button">
              {t("学生情况", "Students")}
            </button>
            <button className={`btn ${gradingView === "submissions" ? "" : "secondary"}`} onClick={() => setGradingView("submissions")} type="button">
              {t("批改作业", "Submissions")}
            </button>
          </div>
          {gradingView === "students" && (
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
          )}
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
                  <input
                    type="search"
                    value={publishSearch}
                    onChange={(event) => setPublishSearch(event.target.value)}
                    placeholder={t("搜索作业名称", "Search by title")}
                  />
                  <div className="publish-homework-scroll">
                    <AssignmentPicker
                      value={selectedId}
                      assignments={filterAssignmentsByTitle(areaAssignments, publishSearch)}
                      onChange={editAssignment}
                      compact
                    />
                  </div>
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
                    <button className="btn accent" onClick={() => saveAssignment(false)} disabled={!token && !account} type="button">
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

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "grading" && gradingView === "submissions" && (
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
                <span className={`pill ${submissions.length ? "accent" : ""}`}>{submissions.length}</span>
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
                <button className="btn ai" onClick={analyzeSubmission} disabled={loading} type="button">
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
                <button className="btn ai" onClick={analyzeSubmission} disabled={loading} type="button">
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
          <TeacherSchedulePanel token={token} language={teacherLanguage} />
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "lessonRecording" && (
        <section className="single-column">
          <LessonProgressPanel students={students} />
        </section>
      )}

      {hasTeacherAccess && navLevel === "detail" && teacherSection === "dailyTasks" && (
        <section className="single-column">
          <TeacherDailyTasksPanel students={students} api={api} language={teacherLanguage} />
        </section>
      )}
          </div>
        </div>
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
  return assignment?.title || tr("口语作业", "Speaking homework");
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

function sectionLabel(section: TeacherSection, language: TeacherLanguage = "zh") {
  const labels: Record<TeacherSection, { zh: string; en: string }> = {
      studentOverview: { zh: "总览", en: "Overview" },
    studentInvite: { zh: "学生注册", en: "Student sign-up" },
    assignments: { zh: "作业布置", en: "Homework publishing" },
    grading: { zh: "作业批改", en: "Homework grading" },
    schedule: { zh: "课程排课", en: "Lesson scheduling" },
    lessonRecording: { zh: "课程进度", en: "Lesson progress" },
    dailyTasks: { zh: "每日任务", en: "Daily tasks" }
  };
  return labels[section][language];
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
  if (item.unit === "seconds") return `${Math.round(item.used / 60)} / ${Math.round(item.limit / 60)} ${tr("分钟", "min")}`;
  if (item.unit === "bytes") {
    const gb = (value: number) => (value / 1024 / 1024 / 1024).toFixed(1);
    return `${gb(item.used)} / ${gb(item.limit)} GB`;
  }
  return `${item.used} / ${item.limit}${tr(" 次", "")}`;
}

// Title only: that is what the teacher remembers a homework by.
function filterAssignmentsByTitle(assignments: Assignment[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return assignments;
  return assignments.filter((assignment) => assignment.title.toLowerCase().includes(needle));
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
  if (!assignments.length) return <p className="hint">{tr("还没有保存过作业。", "No homework saved yet.")}</p>;

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
          {!compact && <span className="pill">{assignment.assignment_type === "writing" ? tr("写作", "Writing") : tr("口语", "Speaking")}</span>}
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
  const [selectedP1SetId, setSelectedP1SetId] = useState(currentP1Bank[0]?.id || "");
  const [selectedP2P3SetId, setSelectedP2P3SetId] = useState(currentP2P3Bank[0]?.id || "");
  const suggestedSpeakingTitle = buildSpeakingHomeworkTitle(draft);
  const titleIsAutoGenerated =
    activeArea === "speaking" && (!draft.title.trim() || isAutoSpeakingHomeworkTitle(draft.title));

  const selectedP1Set = p1QuestionBank.find((set) => set.id === selectedP1SetId) || currentP1Bank[0];
  const selectedP2P3Set = p2P3QuestionBank.find((set) => set.id === selectedP2P3SetId) || currentP2P3Bank[0];

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
        <label>{tr("作业标题", "Title")}</label>
        <input
          value={draft.title}
          placeholder={activeArea === "speaking" ? suggestedSpeakingTitle : ""}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        {activeArea === "speaking" && <p className="hint">{tr("建议标题：", "Suggested title: ")}{suggestedSpeakingTitle}{tr("。你可以手动修改。", ". You can edit it.")}</p>}
      </div>
      <div>
        <label>{tr("创建日期", "Created")}</label>
        <input value={draft.created_at ? formatDate(draft.created_at) : tr("保存时自动生成", "Set when saved")} readOnly />
      </div>
      <div>
        <label>{tr("截止日期", "Due date")}</label>
        <input
          type="date"
          value={draft.due_date || ""}
          onChange={(event) => setDraft({ ...draft, due_date: event.target.value, deadline_text: event.target.value })}
        />
      </div>
      <div>
        <label>{tr("训练说明", "Instructions")}</label>
        <textarea value={draft.training_note} onChange={(event) => setDraft({ ...draft, training_note: event.target.value })} />
      </div>
      <div className="area-badge">
        <label>{tr("当前板块", "Area")}</label>
        <span className="pill ok">{activeArea === "writing" ? tr("仅写作作业", "Writing only") : tr("仅口语作业", "Speaking only")}</span>
      </div>
      <div>
        <label>{tr("分配学生", "Students")}</label>
        <StudentAssignmentSelector
          selected={draft.assigned_students || []}
          students={students}
          onChange={(assigned_students) => setDraft({ ...draft, assigned_students })}
        />
        <p className="hint">{tr("如果不勾选任何学生，这份作业会对所有学生可见。", "With no student ticked, every student can see this homework.")}</p>
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
              <TopicPicker
                label={tr("Part 1 题库", "Part 1 topic bank")}
                topics={p1QuestionBank}
                selectedId={selectedP1SetId}
                assignedIds={assignedTopicIds.p1}
                onSelect={setSelectedP1SetId}
              />
              {selectedP1Set && assignedTopicIds.p1.has(selectedP1Set.id) && (
                <p className="hint warn">{tr("这个话题已经布置给该学生了。", "This topic has already been set for this student.")}</p>
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
                {tr("添加到 Part 1", "Add to Part 1")}
              </button>
              <button className="btn secondary" type="button" onClick={replaceP1Set}>
                {tr("替换 Part 1", "Replace Part 1")}
              </button>
            </div>
          </div>
          <QuestionInputs title={tr("Part 1 题目", "Part 1 questions")} values={draft.p1_questions} onChange={(p1_questions) => updateSpeakingDraft({ ...draft, p1_questions })} />
          <div className="bank-panel">
            <div>
              <TopicPicker
                label={tr("Part 2 & 3 题库", "Part 2 & 3 topic bank")}
                topics={p2P3QuestionBank}
                selectedId={selectedP2P3SetId}
                assignedIds={assignedTopicIds.p2}
                onSelect={setSelectedP2P3SetId}
              />
              {selectedP2P3Set && assignedTopicIds.p2.has(selectedP2P3Set.id) && (
                <p className="hint warn">{tr("这个话题已经布置给该学生了。", "This topic has already been set for this student.")}</p>
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
              {tr("应用到 Part 2 & 3", "Apply to Part 2 & 3")}
            </button>
          </div>
          <div>
            <label>{tr("Part 2 题卡", "Part 2 cue card")}</label>
            <textarea value={draft.p2_prompt} onChange={(event) => updateSpeakingDraft({ ...draft, p2_prompt: event.target.value })} />
          </div>
          <QuestionInputs title={tr("Part 3 题目", "Part 3 questions")} values={draft.p3_questions} onChange={(p3_questions) => updateSpeakingDraft({ ...draft, p3_questions })} />
        </>
      )}
    </div>
  );
}

/**
 * Picks one topic out of the bank.
 *
 * This was a native select. Part 2 alone holds seventy-odd topics, and laying
 * them out as buttons would have made finding one harder than the select did —
 * a select at least takes typed characters and jumps. The filter is what earns
 * the change: the whole bank is visible, already-assigned topics are marked
 * where you can see them rather than inside a closed list, and typing still
 * narrows it.
 */
function TopicPicker({
  label,
  topics,
  selectedId,
  assignedIds,
  onSelect
}: {
  label: string;
  topics: Array<{ id: string; topic: string; retired?: boolean }>;
  selectedId: string;
  assignedIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  // Retired topics are out of the way until asked for; a teacher revising an
  // old topic with a student can still reach them.
  const [showRetired, setShowRetired] = useState(false);
  const needle = filter.trim().toLowerCase();
  const pool = showRetired ? topics : topics.filter((set) => !set.retired);
  const shown = needle ? pool.filter((set) => set.topic.toLowerCase().includes(needle)) : pool;
  const retiredCount = topics.filter((set) => set.retired).length;

  return (
    <div className="topic-picker">
      <div className="topic-picker-head">
        <label>{label}</label>
        <input
          className="topic-picker-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={tr("筛选话题", "Filter topics")}
        />
      </div>
      <div className="topic-picker-list">
        {shown.map((set) => (
          <button
            className={`topic-picker-chip ${set.id === selectedId ? "selected" : ""}`}
            key={set.id}
            onClick={() => onSelect(set.id)}
            type="button"
          >
            <span>{set.topic}</span>
            {set.retired && <em className="muted">{tr("往期", "Earlier")}</em>}
            {assignedIds.has(set.id) && <em>{tr("已布置过", "Set before")}</em>}
          </button>
        ))}
        {!shown.length && <p className="hint">{tr("没有匹配的话题。", "No matching topics.")}</p>}
      </div>
      <p className="hint topic-picker-foot">
        <span>
          {needle ? tr(`匹配 ${shown.length} / ${pool.length} 个话题`, `${shown.length} of ${pool.length} topics match`) : tr(`共 ${pool.length} 个话题`, `${pool.length} topics`)}
        </span>
        {retiredCount > 0 && (
          <label className="check-row plain">
            <input type="checkbox" checked={showRetired} onChange={(event) => setShowRetired(event.target.checked)} />
            <span>{tr(`含往期话题（${retiredCount}）`, `Include earlier seasons (${retiredCount})`)}</span>
          </label>
        )}
      </p>
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
          <label>{tr("该学生之前发布过的话题", "Topics already set for this student")}</label>
          <div className="hint">{tr("选新题前可以快速检查，避免重复。", "A quick check before picking new ones, to avoid repeats.")}</div>
        </div>
        <span className="pill">{tr(`${total} 个话题`, `${total} topics`)}</span>
      </div>
      {total ? (
        activeArea === "writing" ? (
          <TopicList title={tr("写作任务", "Writing tasks")} items={history.writing} />
        ) : (
          <div className="topic-history-grid">
            <TopicList title="Part 1" items={history.p1} />
            <TopicList title="Part 2" items={history.p2} />
          </div>
        )
      ) : (
        <p className="hint">{tr("请选择学生，或先为该学生发布第一份作业来生成话题历史。", "Choose a student, or publish their first homework to start a topic history.")}</p>
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
        <p className="hint">{tr("还没有话题记录。", "No topics yet.")}</p>
      )}
      {items.length > 12 && (
        <button className="btn link" type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? tr("收起", "Collapse") : tr(`展开全部 ${items.length} 个`, `Show all ${items.length}`)}
        </button>
      )}
    </div>
  );
}

/**
 * Picks who the homework goes to.
 *
 * The roster used to sit open on the page, one row per student, so a teacher
 * with a dozen of them scrolled past the whole list to reach the questions
 * below. It is a dropdown now. Closed, it says how many are picked and the
 * chips underneath say who; open, it is the same rows plus a filter, because
 * a closed list you cannot search is worse than an open one.
 */
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
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedKeys = new Set(selected.map(normalizeStudentName));

  // A click anywhere else, or Escape, puts the list away. Without this the
  // panel hangs over the rest of the form until you find the toggle again.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? students.filter((student) => student.name.toLowerCase().includes(needle)) : students;

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
    setFilter("");
  }

  return (
    <div className="student-selector" ref={rootRef}>
      <button
        className={`student-select-toggle ${open ? "open" : ""}`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{selected.length ? tr(`已选 ${selected.length} 名学生`, `${selected.length} students selected`) : tr("全部学生", "All students")}</span>
        <em>{open ? tr("收起", "Close") : tr("选择", "Choose")}</em>
      </button>

      {open && (
        <div className="student-select-panel">
          {students.length ? (
            <>
              <input
                className="student-select-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={tr("搜索学生姓名", "Search by name")}
              />
              <div className="student-check-list scrolling">
                {shown.map((student) => (
                  <label className="check-row" key={student.id}>
                    <input
                      checked={selectedKeys.has(student.normalized_name)}
                      onChange={() => toggleStudent(student.name)}
                      type="checkbox"
                    />
                    <span>{student.name}</span>
                    <small>{tr(`${student.submission_count || 0} 次提交`, `${student.submission_count || 0} submissions`)}</small>
                  </label>
                ))}
                {!shown.length && <p className="hint">{tr("没有匹配的学生。", "No matching students.")}</p>}
              </div>
            </>
          ) : (
            <p className="hint">{tr("还没有学生档案。学生注册或填写姓名后会出现在这里。", "No student profiles yet. Students appear here once they sign up or enter a name.")}</p>
          )}
          <div className="manual-student-row">
            <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder={tr("添加学生姓名", "Add a student name")} />
            <button className="btn secondary" onClick={addManualStudent} type="button">
              {tr("添加", "Add")}
            </button>
          </div>
        </div>
      )}

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
          ? `${tr("提交时间：", "Submitted: ")}${new Date(submission.submitted_at).toLocaleString(tr("zh-CN", "en-GB"))}`
          : `${tr("发布时间：", "Published: ")}${assignment.created_at ? formatDate(assignment.created_at) : tr("暂无日期", "No date")}${assignment.due_date ? ` | ${tr("截止日期：", "Due: ")}${formatDate(assignment.due_date)}` : ""}`
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
      dateLabel: `${tr("提交时间：", "Submitted: ")}${new Date(submission.submitted_at).toLocaleString(tr("zh-CN", "en-GB"))}`
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
        setPracticeStatus(data.error || tr(`无法加载自主练习。状态码：${response.status}`, `Could not load practice submissions (status ${response.status}).`));
        return;
      }
      setPracticeRows(data.practices || []);
      setPracticeStatus("");
    } catch (error) {
      setPracticeStatus(error instanceof Error ? error.message : tr("无法加载自主练习。", "Could not load practice submissions."));
    }
  }

  async function savePracticeFeedback(practice: SpeakingPracticeSubmission, patch: PracticeFeedbackDraft) {
    setPracticeStatus(tr("保存中...", "Saving..."));
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
      setPracticeStatus(data.error || tr("保存失败。", "Could not save."));
      return;
    }
    if (data.practice) setPracticeRows((current) => current.map((item) => (item.id === data.practice.id ? data.practice : item)));
    setPracticeStatus(tr("已保存自主练习批改。", "Practice feedback saved."));
  }

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>{tr("学生情况", "Students")}</h2>
          <div className="hint">{activeArea === "writing" ? tr("打开学生档案后，可以查看写作进度和提交记录。", "Open a student to see their writing progress and submissions.") : tr("打开学生档案后，可以查看口语进度和提交记录。", "Open a student to see their speaking progress and submissions.")}</div>
        </div>
        <span className="pill">{tr(`${students.length} 位学生`, `${students.length} students`)}</span>
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
                  <span className="student-row-progress">
                    <em>{tr("批改进度", "Marked")}</em>
                    {student.reviewed_count || 0}/{student.submission_count || 0}
                  </span>
                  {student.latest_score !== null && student.latest_score !== undefined && (
                    <span className="pill score">{Number(student.latest_score).toFixed(1)}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">{tr("还没有学生档案。", "No student profiles yet.")}</p>
          )}
        </aside>

        <section className="student-profile-main">
          {selectedStudentName ? (
            <div className="student-profile">
              <div className="section-head compact">
                <div>
                  <h3>{selectedStudentName}</h3>
                  <div className="hint">
                    {tr(`${homeworkRows.length} 份已发布作业，${studentProgress.length} 次提交。`, `${homeworkRows.length} homework published, ${studentProgress.length} submissions.`)}
                  </div>
                </div>
                <button className="btn secondary" type="button" onClick={() => onAssignHomework(selectedStudentName)}>
                  {tr("布置作业", "Set homework")}
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
                    <h3>{tr("给该学生发布作业", "Publish homework for this student")}</h3>
                    <div className="hint">{activeArea === "writing" ? tr("可以直接从学生档案中创建写作作业。", "Create writing homework straight from the profile.") : tr("可以直接从学生档案中创建口语作业。", "Create speaking homework straight from the profile.")}</div>
                  </div>
                  <span className="pill ok">{activeArea === "writing" ? tr("写作", "Writing") : tr("口语", "Speaking")}</span>
                </summary>
                <div className="stack">
                  <button className="btn secondary" type="button" onClick={() => onPrepareHomework(selectedStudentName)}>
                    {tr(`为 ${selectedStudentName} 新建作业`, `New homework for ${selectedStudentName}`)}
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
                      {tr("发布为新作业", "Publish as new homework")}
                    </button>
                  </div>
                </div>
              </details>
              <div className="stack">
                <div className="section-head compact">
                  <h3>{tr("作业历史", "Homework history")}</h3>
                  <span className="pill">{homeworkRows.length}</span>
                </div>
                {homeworkRows.length ? (
                  homeworkRows.map((row) => (
                    <button className="submission-row" key={row.key} type="button" onClick={() => onOpenHomework(row.assignment, row.submission)}>
                      <span className="homework-history-title-row">
                        <strong>{row.title}</strong>
                        <span className={`pill compact ${row.status === "reviewed" ? "ok" : row.status === "submitted" ? "warn" : ""}`}>
                          {row.status === "reviewed" ? tr("已批改", "Marked") : row.status === "submitted" ? tr("已提交", "Submitted") : tr("已发布", "Published")}
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
                  <p className="hint">{tr("还没有给该学生发布过作业。", "No homework published for this student yet.")}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>{tr("请选择学生", "Choose a student")}</h3>
              <p className="hint">{tr("从左侧选择学生后查看学习进度和提交记录。", "Pick a student on the left to see their progress and submissions.")}</p>
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
          <h3>{tr("自主口语练习", "Self-practice (speaking)")}</h3>
          <div className="hint">{tr("学生从口语过题情况里自主提交的 P1 或 P2+P3 练习。", "P1 or P2+P3 practice the student submitted from the topic board.")}</div>
        </div>
        <button className="btn secondary" type="button" onClick={onRefresh}>
          {tr("刷新", "Refresh")}
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
        <p className="hint">{tr("该学生还没有提交自主口语练习。", "No practice submissions from this student yet.")}</p>
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
  const statusLabel = practice.status === "reviewed" ? tr("已批改", "Marked") : tr("待批改", "To mark");
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
          <span>{tr(`${recordingCount} 条录音`, `${recordingCount} recordings`)}</span>
          <span>{tr("点击查看批改", "Open to mark")}</span>
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
              {recording?.signed_url ? <audio controls src={recording.signed_url} /> : <p className="hint">{tr("这题还没有录音。", "No recording for this question.")}</p>}
              {recording && (
                <div>
                  <label>{tr("本题点评", "Comment")}</label>
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
          <label>{tr("总评", "Overall comment")}</label>
          <textarea value={draft.teacherComment} onChange={(event) => setDraft({ ...draft, teacherComment: event.target.value })} />
        </div>
        <button className="btn" type="button" onClick={() => onSave(practice, draft)}>
          {tr("保存自主练习批改", "Save practice feedback")}
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
            {tr("删除", "Delete")}
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
  // Stored values stay Chinese; only the option text is translated.
  const typeLabel = (type: string) =>
    ({
      折线图: "Line graph", 柱状图: "Bar chart", 饼图: "Pie chart", 表格: "Table", 流程图: "Process", 地图: "Map",
      单边观点: "Opinion (one side)", 双边讨论: "Discuss both views", "原因分析+观点": "Causes + opinion", "现状分析+观点": "Situation + opinion"
    })[type] || type;
  const hasTask1 = safeTasks.some((task) => task.key === "writing_task_1");
  const hasTask2 = safeTasks.some((task) => task.key === "writing_task_2");

  function updateTask(index: number, patch: Partial<WritingTask>) {
    onChange(safeTasks.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)));
  }

  async function uploadTaskImage(index: number, file?: File) {
    if (!file) return;
    if (!token && !hasTeacherAccount) {
      setMessage(tr("请先以老师身份登录，再上传图片。", "Sign in as a teacher before uploading images."));
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
      setMessage(error instanceof Error ? error.message : tr("图片上传失败。", "Image upload failed."));
    } finally {
      setUploadingTaskKey("");
    }
  }

  return (
    <div className="stack">
      <label>{tr("写作任务", "Writing tasks")}</label>
      {safeTasks.map((task, index) => {
        const isTask1 = task.key === "writing_task_1";
        const isTask2 = task.key === "writing_task_2";
        return (
        <article className="question-card" key={task.key || index}>
          <div className="two">
            <div>
              <label>{tr("任务标题", "Task title")}</label>
              <input value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} />
            </div>
            <div>
              <label>{tr("字数要求", "Word count")}</label>
              <input value={task.word_limit || ""} onChange={(event) => updateTask(index, { word_limit: event.target.value })} />
            </div>
          </div>
          {isTask1 && (
            <div>
              <label>{tr("Writing Task 1 类型", "Writing Task 1 type")}</label>
              <select value={task.task1_type || ""} onChange={(event) => updateTask(index, { task1_type: event.target.value })}>
                <option value="">{tr("选择 Task 1 类型", "Choose a Task 1 type")}</option>
                {task1Types.map((type) => (
                  <option key={type} value={type}>
                    {tr(type, typeLabel(type))}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isTask2 && (
            <div className="two">
              <div>
                <label>{tr("Writing Task 2 类型", "Writing Task 2 type")}</label>
                <select value={task.task2_type || ""} onChange={(event) => updateTask(index, { task2_type: event.target.value })}>
                  <option value="">{tr("选择 Task 2 类型", "Choose a Task 2 type")}</option>
                  {task2Types.map((type) => (
                    <option key={type} value={type}>
                      {tr(type, typeLabel(type))}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>{tr("Writing Task 2 主题", "Writing Task 2 topic")}</label>
                <input
                  value={task.topic || ""}
                  onChange={(event) => updateTask(index, { topic: event.target.value })}
                  placeholder={tr("例如：教育、科技、环境...", "e.g. education, technology, environment...")}
                />
              </div>
            </div>
          )}
          <div>
            <label>{tr("题目要求", "Prompt")}</label>
            <textarea value={task.prompt} onChange={(event) => updateTask(index, { prompt: event.target.value })} />
          </div>
          {isTask1 && (
            <div className="stack">
              <label>{tr("Task 1 图片", "Task 1 image")}</label>
              <label className="file-upload">
                {uploadingTaskKey === task.key ? tr("上传中...", "Uploading...") : tr("上传图片", "Upload image")}
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
                      <img alt={tr("Writing Task 1 题目图片", "Writing Task 1 figure")} src={imageUrl} />
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => updateTask(index, { image_urls: (task.image_urls || []).filter((url) => url !== imageUrl) })}
                      >
                        {tr("删除图片", "Remove image")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">{tr("可选。适用于 IELTS Writing Task 1 的图表、地图、表格和流程图。", "Optional: the chart, map, table or process diagram for Writing Task 1.")}</p>
              )}
            </div>
          )}
          <button
            className="btn secondary"
            disabled={safeTasks.length <= 1}
            type="button"
            onClick={() => onChange(safeTasks.filter((_, taskIndex) => taskIndex !== index))}
          >
            {tr("删除任务", "Remove task")}
          </button>
        </article>
        );
      })}
      <div className="bank-actions">
        <button className="btn ghost" disabled={hasTask1} type="button" onClick={() => onChange(sortWritingTasks([...safeTasks, createWritingTask(0)]))}>
          {tr("添加 Task 1", "Add Task 1")}
        </button>
        <button className="btn ghost" disabled={hasTask2} type="button" onClick={() => onChange(sortWritingTasks([...safeTasks, createWritingTask(1)]))}>
          {tr("添加 Task 2", "Add Task 2")}
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
      <label>{tr("录音", "Recording")}</label>
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
                {recording.signed_url ? <audio controls src={recording.signed_url} /> : <p className="hint">{tr("录音链接暂时不可用。", "The recording is not available right now.")}</p>}
                <div className="transcript-editor">
                  <div className="section-head compact">
                    <div>
                      <label>{tr("录音转写", "Transcript")}</label>
                      <div className="hint">{tr("生成转写后可以修改并保存。发布批改后，学生会看到转写和修改痕迹。", "Generate a transcript, then edit and save it. Once feedback is published the student sees the transcript with your edits.")}</div>
                    </div>
                    <button
                      className="btn secondary"
                      disabled={transcribingId === recording.id}
                      onClick={() => onTranscribe(recording.id)}
                      type="button"
                    >
                      {transcribingId === recording.id
                        ? tr("生成中...", "Generating...")
                        : recording.transcript_text
                          ? tr("重新生成转写", "Regenerate transcript")
                          : tr("生成转写", "Generate transcript")}
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
                    <p className="hint">{tr("还没有转写。", "No transcript yet.")}</p>
                  )}
                </div>
                <div className="transcript-editor">
                  <div className="section-head compact">
                    <div>
                      <label>{tr("示范回答", "Sample answer")}</label>
                      <div className="hint">{tr("可以在这里直接录制老师示范回答。发布批改后，学生可以播放参考。", "Record a sample answer here. Once feedback is published the student can play it.")}</div>
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
                    <p className="hint">{tr("还没有示范回答。", "No sample answer yet.")}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="transcript-editor">
                <span className="pill warn">{tr("缺少录音", "No recording")}</span>
                <p className="hint">{tr("这个问题还没有上传录音。请学生重新打开作业并再次保存这一题。", "No recording was uploaded for this question. Ask the student to reopen the homework and save it again.")}</p>
              </div>
            )}
            {comment && (
              <div className="inline-comment">
                <label>{tr("本题整体点评", "Comment on this question")}</label>
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
      window.alert(tr("请先在转写里选中要批注的文字。", "Select some text in the transcript first."));
      return;
    }
    const note = window.prompt(`${tr("批注", "Note on")}「${selection.slice(0, 40)}${selection.length > 40 ? "..." : ""}」${tr("：", ":")}`);
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
            <label>{tr("录音转写（审阅模式）", "Transcript (review mode)")}</label>
            <div className="hint">
              {tr("直接修改文字，改动会实时标记：绿色为新增，红色删除线为删去。选中一段后点「添加批注」。", "Edit the text directly; changes are marked as you go (green added, red struck out). Select a passage and click “Add note”.")}
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
              {tr("添加批注", "Add note")}
            </button>
            <button
              className="btn secondary"
              disabled={savingTranscript}
              onClick={() => onTranscriptSave(recordingId, editedTranscript)}
              type="button"
            >
              {savingTranscript ? tr("保存中...", "Saving...") : tr("保存转写修改", "Save transcript edits")}
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
          <label>{tr("批注", "Notes")}</label>
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
                {tr("删除", "Delete")}
              </button>
            </div>
          ))
        ) : (
          <p className="hint">{tr("在左侧转写里选中文字即可添加批注。", "Select text in the transcript to add a note.")}</p>
        )}
      </aside>
    </div>
  );
}

type DemoDraft = { blob: Blob; url: string; duration: number };

/**
 * Records the teacher's sample answer.
 *
 * Stopping used to upload immediately, so a fluffed line could only be undone
 * by recording the whole thing again over the top of it. Stopping now produces
 * a draft the teacher can listen back to and either keep or throw away, and the
 * recording can be paused mid-answer.
 */
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
  const draftRef = useRef<DemoDraft | null>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [canPause, setCanPause] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState<DemoDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function startTimer() {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setSeconds(elapsedRef.current);
    }, 1000);
  }

  function clearDraft() {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
    draftRef.current = null;
    setDraft(null);
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(tr("当前浏览器不支持网页录音。请使用 Chrome、Edge 或 Safari。", "This browser cannot record audio. Please use Chrome, Edge or Safari."));
      return;
    }

    setError("");
    clearDraft();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(tr("麦克风权限被阻止。请允许麦克风权限后重试。", "Microphone access is blocked. Allow it and try again."));
      return;
    }

    const mimeType = getSupportedTeacherAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setSeconds(0);
    // Safari was late to pause(); hide the control rather than offer one that
    // throws.
    setCanPause(typeof recorder.pause === "function" && typeof recorder.resume === "function");

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blobType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: blobType });
      setProcessing(false);
      if (!blob.size) {
        setError(tr("录音内容为空，请重新录制。", "The recording is empty; please record again."));
        return;
      }
      const next = { blob, url: URL.createObjectURL(blob), duration: elapsedRef.current };
      draftRef.current = next;
      setDraft(next);
    };

    recorder.start(1000);
    setActive(true);
    setPaused(false);
    startTimer();
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      stopTimer();
      setPaused(true);
    } else if (recorder.state === "paused") {
      recorder.resume();
      startTimer();
      setPaused(false);
    }
  }

  function stop() {
    setProcessing(true);
    stopTimer();
    setActive(false);
    setPaused(false);
    recorderRef.current?.stop();
  }

  function save() {
    if (!draft) return;
    const file = new File([draft.blob], `teacher-sample.${audioExtension(draft.blob.type)}`, {
      type: draft.blob.type
    });
    onSave(recordingId, file, draft.duration);
    clearDraft();
    setSeconds(0);
  }

  function discard() {
    clearDraft();
    setSeconds(0);
    setError("");
  }

  if (draft) {
    return (
      <div className="recorder-row demo-review">
        <audio controls src={draft.url} />
        <span className="timer">{formatTime(draft.duration)}</span>
        <button className="btn" disabled={disabled} onClick={save} type="button">
          {disabled ? tr("保存中...", "Saving...") : tr("保存示范", "Save sample")}
        </button>
        <button className="btn secondary" disabled={disabled} onClick={discard} type="button">
          {tr("重录", "Re-record")}
        </button>
        <span className="hint">{tr("满意再保存，保存后会覆盖上一条示范。", "Save when you're happy with it; saving replaces the previous sample.")}</span>
      </div>
    );
  }

  return (
    <div className="recorder-row">
      {active ? (
        <>
          {canPause && (
            <button className="btn secondary" onClick={togglePause} type="button">
              {paused ? tr("继续", "Resume") : tr("暂停", "Pause")}
            </button>
          )}
          <button className="btn danger" onClick={stop} type="button">
            {tr("停止", "Stop")}
          </button>
        </>
      ) : (
        <button className="btn rec" disabled={disabled || processing} onClick={() => void start()} type="button">
          {disabled ? tr("保存中...", "Saving...") : processing ? tr("处理中...", "Processing...") : tr("录制示范回答", "Record sample answer")}
        </button>
      )}
      <span className="timer">{formatTime(seconds)}</span>
      {error ? (
        <span className="error">{error}</span>
      ) : (
        <span className="hint">{active ? (paused ? tr("已暂停，点「继续」接着录。", "Paused — click Resume to carry on.") : tr("录制中，停止后可以先试听。", "Recording — stop to listen back first.")) : tr("可以直接在本页面录制。", "Record right here on this page.")}</span>
      )}
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
      <label>{tr("作文提交", "Essay submission")}</label>
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
                  <label>{tr("学生作文", "Student's essay")}</label>
                  <div className="writing-text">{response.response_text}</div>
                </div>
                <div>
                  <label>{tr("老师修改版本", "Teacher's edited version")}</label>
                  <textarea value={editedText} onChange={(event) => onRevisionChange(response.id, event.target.value)} />
                </div>
              </div>
              <button
                className="btn secondary"
                disabled={savingWritingId === response.id}
                onClick={() => onRevisionSave(response.id, editedText)}
                type="button"
              >
                {savingWritingId === response.id ? tr("保存中...", "Saving...") : tr("保存作文修改", "Save essay edits")}
              </button>
              <TranscriptDiff original={response.response_text} edited={editedText} />
              {comment && (
                <div className="inline-comment">
                  <label>{tr("本题点评", "Comment")}</label>
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
        <p className="hint">{tr("学生还没有提交作文。", "The student has not submitted an essay.")}</p>
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
        <h3>{tr("作文审阅", "Essay review")}</h3>
        <p className="hint">{tr("直接在学生作文上修改；下方会显示修订痕迹，也可以选中文字后添加批注。", "Edit the essay directly; the revisions show below, and you can select text to add a note.")}</p>
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
        <p className="hint">{tr("学生还没有提交作文。", "The student has not submitted an essay.")}</p>
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
      window.alert(tr("请先在作文里选中需要批注的文字。", "Select some text in the essay first."));
      return;
    }
    const comment = window.prompt(tr("请输入批注内容：", "Your note:"));
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
              <label>{tr("修订", "Revisions")}</label>
              <div className="hint">{tr("在下方作文框中直接修改学生原文。", "Edit the student's text in the box below.")}</div>
            </div>
            <div className="segmented compact-segmented">
              <button className="btn secondary" onClick={addInlineComment} type="button">
                {tr("添加批注", "Add note")}
              </button>
              <button
                className="btn secondary"
                disabled={savingWritingId === response.id}
                onClick={() => onRevisionSave(response.id, editedText)}
                type="button"
              >
                {savingWritingId === response.id ? tr("保存中...", "Saving...") : tr("保存修改", "Save edits")}
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
            <label>{tr("本题总点评", "Overall comment on this task")}</label>
            <textarea
              value={reviewComment.general}
              onChange={(event) => updateReviewComment({ general: event.target.value })}
            />
          </div>
        </div>

        <aside className="writing-comment-sidebar">
          <div className="section-head compact">
            <label>{tr("批注", "Notes")}</label>
            <span className="pill">{reviewComment.inlineComments.length}</span>
          </div>
          {reviewComment.inlineComments.length ? (
            reviewComment.inlineComments.map((item, index) => (
              <div className="writing-comment-bubble" key={item.id}>
                <div className="comment-anchor">{tr("批注", "Note")} {index + 1}</div>
                <blockquote>{item.quote}</blockquote>
                <textarea
                  value={item.comment}
                  onChange={(event) => updateInlineComment(item.id, { comment: event.target.value })}
                />
                <button className="btn danger compact-button" onClick={() => deleteInlineComment(item.id)} type="button">
                  {tr("删除批注", "Delete note")}
                </button>
              </div>
            ))
          ) : (
            <p className="hint">{tr("选中作文中的文字后，点击“添加批注”。", "Select text in the essay, then click “Add note”.")}</p>
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
        <h3>{tr("学生作文", "Student's essay")}</h3>
        <p className="hint">{tr("左侧显示学生提交的原文和题目。", "The prompt and the student's original text.")}</p>
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
              <label>{tr("学生原文", "Original text")}</label>
              <div className="writing-text large">{response.response_text}</div>
            </article>
          );
        })
      ) : (
        <p className="hint">{tr("学生还没有提交作文。", "The student has not submitted an essay.")}</p>
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
        <h3>{tr("老师批改", "Teacher's marking")}</h3>
        <p className="hint">{tr("右侧修改学生作文，并填写每题点评。", "Edit the essay and comment on each task here.")}</p>
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
              <label>{tr("老师修改版本", "Teacher's edited version")}</label>
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
                {savingWritingId === response.id ? tr("保存中...", "Saving...") : tr("保存作文修改", "Save essay edits")}
              </button>
              <TranscriptDiff original={response.response_text} edited={editedText} />
              {comment && (
                <div className="inline-comment">
                  <label>{tr("本题点评", "Comment")}</label>
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
        <p className="hint">{tr("学生还没有提交作文。", "The student has not submitted an essay.")}</p>
      )}
    </div>
  );
}

function TaskImageGrid({ imageUrls }: { imageUrls: string[] }) {
  return (
    <div className="task-image-grid">
      {imageUrls.map((imageUrl) => (
        <img alt={tr("写作 Task 1 题目图片", "Writing Task 1 figure")} className="task-image" key={imageUrl} src={imageUrl} />
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
          <span>{tr("平均分", "Average")}</span>
          <strong>{average.toFixed(1)}</strong>
        </div>
        <label>{tr("总评", "Overall comment")}</label>
        <textarea value={feedback.overall_comment} onChange={(event) => updateComment(event.target.value)} />
      </div>
      <div className="stack">
        <label>{tr("评分区", "Scores")}</label>
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
      <button className="btn accent" onClick={publish} type="button">
        {tr("发布批改", "Publish feedback")}
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
  if (!value) return tr("暂无时间", "No time");
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
