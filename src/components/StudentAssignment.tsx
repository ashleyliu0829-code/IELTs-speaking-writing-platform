"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Assignment, Feedback, FeedbackDetail, QuestionItem, Recording, Submission, WritingResponse, WritingTask } from "@/lib/types";
import { questionCommentDetails, scoreDetails } from "@/lib/feedback";
import { averageScore, getQuestionItems } from "@/lib/questions";
import { LearningProgressPanel } from "@/components/LearningProgress";
import { TrackedText, TranscriptDiff } from "@/components/TranscriptDiff";
import { parseReviewComment } from "@/lib/reviewComments";

type LocalRecording = {
  blob: Blob;
  url: string;
  duration: number;
};

type UploadStatus = {
  status: "queued" | "uploading" | "done" | "failed";
  message?: string;
};

type StudentAssignmentSummary = Pick<Assignment, "id" | "title" | "deadline_text" | "due_date" | "assignment_type" | "created_at">;
type AuthAccount = {
  id: string;
  role: "teacher" | "student";
  phone: string;
  display_name: string;
};

import { tr, useLanguage } from "@/lib/i18n";

const LABEL_LATEST = () => tr("查看最新作业", "Latest homework");
const LABEL_HISTORY = () => tr("查看历史作业", "Past homework");
const LABEL_AVAILABLE = () => tr("可完成作业", "Homework to do");

export function StudentAssignment({
  assignment,
  publishedFeedback,
  needsSignIn = false,
  accessDenied = false
}: {
  assignment: Assignment;
  publishedFeedback?: Feedback | null;
  /** The server withheld the assignment's content until someone signs in. */
  needsSignIn?: boolean;
  /** The signed-in account is not the one this assignment belongs to. */
  accessDenied?: boolean;
}) {
  const items = useMemo(() => getQuestionItems(assignment), [assignment]);
  const isWriting = assignment.assignment_type === "writing";
  const [activeArea, setActiveArea] = useState<"speaking" | "writing">(assignment.assignment_type || "speaking");
  const activeAreaIsWriting = activeArea === "writing";
  const isCurrentAreaAssignment = activeArea === (assignment.assignment_type || "speaking");
  const { t } = useLanguage();
  const areaTitle = activeAreaIsWriting ? t("写作作业", "Writing homework") : t("口语作业", "Speaking homework");
  const writingTasks = assignment.writing_tasks || [];
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authPhone, setAuthPhone] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [studentName, setStudentName] = useState("");
  const [accountChecked, setAccountChecked] = useState(false);
  const [recordings, setRecordings] = useState<Record<string, LocalRecording>>({});
  const [savedRecordings, setSavedRecordings] = useState<Record<string, Recording>>({});
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, UploadStatus>>({});
  const [writingDrafts, setWritingDrafts] = useState<Record<string, string>>({});
  const [savedWritingResponses, setSavedWritingResponses] = useState<Record<string, WritingResponse>>({});
  const [submissionId, setSubmissionId] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState<"in_progress" | "submitted" | "reviewed">("in_progress");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [processingRecordingKey, setProcessingRecordingKey] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<Feedback | null>(publishedFeedback || null);
  const [history, setHistory] = useState<Submission[]>([]);
  const [availableAssignments, setAvailableAssignments] = useState<StudentAssignmentSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [view, setView] = useState<"latest" | "history">("latest");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const recordedKeys = new Set([...Object.keys(savedRecordings), ...Object.keys(recordings)]);
  const savedWritingKeys = new Set(Object.keys(savedWritingResponses));
  const changedWritingKeys = writingTasks
    .filter((task) => (writingDrafts[task.key] || "").trim() && (writingDrafts[task.key] || "") !== (savedWritingResponses[task.key]?.response_text || ""))
    .map((task) => task.key);
  const hasAnyWriting = writingTasks.some((task) => (writingDrafts[task.key] || savedWritingResponses[task.key]?.response_text || "").trim());
  const isComplete = isWriting ? writingTasks.every((task) => savedWritingKeys.has(task.key)) : items.every((item) => recordedKeys.has(item.key));
  const hasAnyRecording = items.some((item) => recordedKeys.has(item.key));
  const unsavedCount = Object.keys(recordings).length;
  const unsavedWritingCount = changedWritingKeys.length;
  const uploadStatusValues = Object.values(uploadStatuses);
  const uploadTotalCount = uploadStatusValues.length;
  const uploadDoneCount = uploadStatusValues.filter((status) => status.status === "done").length;
  const uploadFailedCount = uploadStatusValues.filter((status) => status.status === "failed").length;
  const p1Count = items.filter((item) => item.part === "p1" && recordedKeys.has(item.key)).length;
  const p3Count = items.filter((item) => item.part === "p3" && recordedKeys.has(item.key)).length;
  const isPreparingRecording = Boolean(activeKey || processingRecordingKey);
  const canViewCurrentAssignment = canStudentViewAssignment(studentName, assignment.assigned_students || []);

  useEffect(() => {
    void loadCurrentAccount();
  }, []);

  async function loadCurrentAccount() {
    try {
      const response = await fetch("/api/auth/me");
      const data = await response.json().catch(() => ({}));
      if (data.account?.role === "student") {
        setAccount(data.account);
        setStudentName(data.account.display_name);
        setAuthName(data.account.display_name);
        setAuthPhone(data.account.phone);
        await loadSubmissionDraftForName(data.account.display_name);
      }
    } finally {
      setAccountChecked(true);
    }
  }

  async function submitAuth() {
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "student",
          phone: authPhone,
          displayName: authName,
          password: authPassword
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("账号操作失败。", "Account request failed."));
      // Which assignment content this account may see is decided on the
      // server, so a sign-in always needs a fresh render rather than a local
      // state update — including a sign-in that follows a sign-out.
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr("账号操作失败。", "Account request failed."));
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setAccount(null);
    setSubmissionId("");
    setSavedRecordings({});
    setSavedWritingResponses({});
    setWritingDrafts({});
    setHistory([]);
    setAvailableAssignments([]);
    setCurrentFeedback(null);
    setMessage(tr("已退出登录。", "Signed out."));
  }

  async function saveStudentProfile() {
    const name = studentName.trim();
    if (!name) return;
    await fetch("/api/student/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentName: name })
    }).catch(() => null);
  }

  async function loadSubmissionDraft(create = false) {
    return loadSubmissionDraftForName(studentName, create);
  }

  async function loadSubmissionDraftForName(nameValue: string, create = false) {
    const name = nameValue.trim();
    if (!name) return "";

    const response = await fetch("/api/student/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: assignment.id, studentName: name, create })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || tr("无法加载已保存内容。", "Could not load saved work."));
      return "";
    }

    const saved = Object.fromEntries(
      ((data.recordings || []) as Recording[]).map((recording) => [recording.question_key, recording])
    );
    const savedWriting = Object.fromEntries(
      ((data.writingResponses || []) as WritingResponse[]).map((response) => [response.task_key, response])
    );
    setSubmissionId(data.submissionId || "");
    setSubmissionStatus(data.submissionStatus || "in_progress");
    setSavedRecordings(saved);
    setSavedWritingResponses(savedWriting);
    setCurrentFeedback(data.feedback || null);
    setWritingDrafts((current) => ({
      ...Object.fromEntries(((data.writingResponses || []) as WritingResponse[]).map((response) => [response.task_key, response.response_text])),
      ...current
    }));
    setSeconds((current) => ({
      ...current,
      ...Object.fromEntries(((data.recordings || []) as Recording[]).map((recording) => [recording.question_key, recording.duration_seconds]))
    }));
    return data.submissionId || "";
  }

  async function saveProfileAndLoadDraft() {
    await saveStudentProfile();
    await loadSubmissionDraft();
  }

  async function toggleRecording(key: string) {
    if (activeKey) {
      if (activeKey !== key) {
        setMessage(tr("请先停止当前录音，再开始下一题。", "Stop the current recording before starting the next question."));
        return;
      }

      recorderRef.current?.stop();
      stopTimer(timerRef);
      setProcessingRecordingKey(key);
      setActiveKey(null);
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
      chunksRef.current = [];
      elapsedRef.current = 0;
      recorderRef.current = recorder;
      setActiveKey(key);
      setSeconds((current) => ({ ...current, [key]: 0 }));
      setMessage("");

      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setSeconds((current) => ({ ...current, [key]: (current[key] || 0) + 1 }));
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blobType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        if (!blob.size) {
          setProcessingRecordingKey(null);
          setMessage(tr("录音为空，请重新录制这一题。", "The recording is empty; please record this question again."));
          return;
        }
        setRecordings((current) => {
          current[key]?.url && URL.revokeObjectURL(current[key].url);
          return {
            ...current,
            [key]: {
              blob,
              url: URL.createObjectURL(blob),
              duration: elapsedRef.current
            }
          };
        });
        setUploadStatuses((current) => ({ ...current, [key]: { status: "queued" } }));
        setProcessingRecordingKey(null);
      };

      recorder.start(1000);
    } catch {
      setMessage(tr("没有获得麦克风权限。请允许麦克风访问后重试。", "Microphone access was refused. Allow it and try again."));
    }
  }

  function deleteRecording(key: string) {
    setRecordings((current) => {
      current[key]?.url && URL.revokeObjectURL(current[key].url);
      const next = { ...current };
      delete next[key];
      return next;
    });
    setUploadStatuses((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSeconds((current) => ({ ...current, [key]: 0 }));
  }

  async function uploadRecordingFile(key: string, file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // The recorder's timer only runs while recording in the browser, so a file
    // picked from a phone used to fall through to the one-second floor below.
    // The length has to come from the file itself.
    const measured = await readAudioDuration(url);
    // The file's own length, or nothing. seconds[key] is not a stopwatch for
    // this file: it is seeded from whatever was already saved for the question,
    // or left over from a recording this upload replaces. Borrowing it made a
    // short re-upload inherit the length of the thing it replaced, which is how
    // a two-minute answer came to be stored as one second in the first place.
    const duration = measured > 0 ? Math.round(measured) : 1;

    setRecordings((current) => {
      current[key]?.url && URL.revokeObjectURL(current[key].url);
      return { ...current, [key]: { blob: file, url, duration } };
    });
    setSeconds((current) => ({ ...current, [key]: duration }));
    setUploadStatuses((current) => ({ ...current, [key]: { status: "queued" } }));
    setMessage(
      measured > 0
        ? tr(`音频已添加（${formatTime(Math.round(measured))}），现在可以保存这段录音。`, `Audio added (${formatTime(Math.round(measured))}); you can save it now.`)
        : tr("音频已添加，现在可以保存这段录音。", "Audio added; you can save it now.")
    );
  }

  async function loadStudentData(area = activeArea) {
    if (!studentName.trim()) {
      setMessage(tr("请先输入姓名。", "Enter your name first."));
      return;
    }

    setHistoryLoading(true);
    setMessage("");
    await saveStudentProfile();
    await loadSubmissionDraft();
    const [historyResponse, assignmentsResponse] = await Promise.all([
      fetch("/api/student/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: studentName.trim() })
      }),
      fetch(`/api/student/assignments?studentName=${encodeURIComponent(studentName.trim())}`)
    ]);
    setHistoryLoading(false);

    const historyData = await historyResponse.json().catch(() => ({}));
    const assignmentsData = await assignmentsResponse.json().catch(() => ({}));
    if (!historyResponse.ok) {
      setMessage(historyData.error || tr("无法加载历史作业。", "Could not load past homework."));
      return;
    }
    if (!assignmentsResponse.ok) {
      setMessage(assignmentsData.error || tr("无法加载作业列表。", "Could not load the homework list."));
      return;
    }

    setHistory(
      (historyData.submissions || []).filter((submission: Submission) => {
        const item = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
        return (item?.assignment_type || "speaking") === area;
      })
    );
    setAvailableAssignments(
      (assignmentsData.assignments || []).filter(
        (item: StudentAssignmentSummary) => (item.assignment_type || "speaking") === area
      )
    );
  }

  async function openHistory() {
    setView("history");
    await loadStudentData();
  }

  async function switchArea(area: "speaking" | "writing") {
    setActiveArea(area);
    setView("latest");
    setMessage("");
    if (studentName.trim()) {
      await loadStudentData(area);
    }
  }

  async function saveRecordings() {
    if (!studentName.trim()) {
      setMessage(tr("请先输入姓名。", "Enter your name first."));
      return;
    }
    if (!hasAnyRecording) {
      setMessage(tr("请至少完成一题录音后再保存。", "Record at least one question before saving."));
      return;
    }
    if (isPreparingRecording) {
      setMessage(tr("请稍等最后一段录音准备完成后再保存。", "Wait for the last recording to finish processing before saving."));
      return;
    }
    if (!unsavedCount) {
      setMessage(tr("已保存的录音会保留在账号里。点击提交后，老师才能看到。", "Saved recordings stay in your account. The teacher sees them once you submit."));
      return;
    }

    await saveStudentProfile();
    const activeSubmissionId = validSubmissionId(submissionId) || (await loadSubmissionDraft(true));
    const itemsToSubmit = items.filter((item) => recordings[item.key]);

    if (!activeSubmissionId) {
      setMessage(tr("无法准备本次提交，请刷新后重试。", "Could not prepare the submission; refresh and try again."));
      return;
    }

    setSubmitting(true);
    setMessage("");
    setSubmissionId(activeSubmissionId);
    window.history.replaceState(null, "", `/s/${assignment.id}?submissionId=${activeSubmissionId}`);
    setUploadStatuses((current) => ({
      ...current,
      ...Object.fromEntries(itemsToSubmit.map((item) => [item.key, { status: "queued" as const }]))
    }));

    let uploadedCount = 0;
    const failed: { key: string; label: string; error: string }[] = [];

    for (const item of itemsToSubmit) {
      const recording = recordings[item.key];
      if (!recording) continue;

      setUploadStatuses((current) => ({
        ...current,
        [item.key]: {
          status: "uploading",
          message: tr(`正在上传 ${uploadedCount + failed.length + 1}/${itemsToSubmit.length}`, `Uploading ${uploadedCount + failed.length + 1}/${itemsToSubmit.length}`)
        }
      }));

      const formData = new FormData();
      formData.append("assignmentId", assignment.id);
      formData.append("submissionId", activeSubmissionId);
      formData.append("item", JSON.stringify(item));
      formData.append("audio", recording.blob, `${item.key}.${audioExtension(recording.blob.type)}`);
      formData.append("duration", String(recording.duration));

      const response = await fetch("/api/student/recording", {
        method: "POST",
        body: formData
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = data.error || tr("上传失败。", "Upload failed.");
        failed.push({ key: item.key, label: item.label, error });
        setUploadStatuses((current) => ({
          ...current,
          [item.key]: { status: "failed", message: error }
        }));
        continue;
      }

      uploadedCount += 1;
      setUploadStatuses((current) => ({
        ...current,
        [item.key]: { status: "done", message: tr("已上传", "Uploaded") }
      }));
    }

    setSubmitting(false);

    const failedKeys = new Set(failed.map((failure) => failure.key));
    if (uploadedCount) {
      setRecordings((current) => {
        Object.entries(current).forEach(([key, recording]) => {
          if (!failedKeys.has(key)) URL.revokeObjectURL(recording.url);
        });
        return Object.fromEntries(Object.entries(current).filter(([key]) => failedKeys.has(key)));
      });
      await loadSubmissionDraft();
      void loadStudentData();
    }

    if (failed.length) {
      setMessage(
        tr(`已上传 ${uploadedCount}/${itemsToSubmit.length} 段录音。失败：`, `Uploaded ${uploadedCount}/${itemsToSubmit.length} recordings. Failed: `) + `${failed
          .map((failure) => `${failure.label}: ${failure.error}`)
          .join("; ")}`
      );
      return;
    }

    setUploadStatuses({});
    setMessage(tr(`已保存 ${uploadedCount}/${itemsToSubmit.length} 段录音。下次打开仍有记录；点击提交后老师才能看到。`, `Saved ${uploadedCount}/${itemsToSubmit.length} recordings. They will still be here next time; the teacher sees them once you submit.`));
  }

  async function submitHomework() {
    if (!studentName.trim()) {
      setMessage(tr("请先输入姓名。", "Enter your name first."));
      return;
    }
    if (isPreparingRecording) {
      setMessage(tr("请稍等最后一段录音准备完成后再提交。", "Wait for the last recording to finish processing before submitting."));
      return;
    }
    if (unsavedCount) {
      setMessage(tr("还有录音未保存。请先点击“保存已录内容”，再提交。", "Some recordings are unsaved. Save them first, then submit."));
      return;
    }
    if (!Object.keys(savedRecordings).length) {
      setMessage(tr("请先至少保存一段录音后再提交。", "Save at least one recording before submitting."));
      return;
    }
    const activeSubmissionId = validSubmissionId(submissionId) || (await loadSubmissionDraft(false));
    if (!activeSubmissionId) {
      setMessage(tr("没有找到已保存内容，请先保存录音。", "Nothing saved yet; save your recordings first."));
      return;
    }

    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/student/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: assignment.id, submissionId: activeSubmissionId, studentName: studentName.trim() })
    });
    setSubmitting(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || tr("提交失败。", "Submission failed."));
      return;
    }
    setSubmissionStatus(data.submissionStatus || "submitted");
    setMessage(tr("已提交给老师。", "Submitted to your teacher."));
  }

  async function saveWriting(mode: "save" | "submit" = "save") {
    if (!studentName.trim()) {
      setMessage(tr("请先输入姓名。", "Enter your name first."));
      return;
    }
    if (!hasAnyWriting) {
      setMessage(mode === "submit" ? tr("请至少完成一项写作任务后再提交。", "Complete at least one writing task before submitting.") : tr("请至少完成一项写作任务后再保存。", "Complete at least one writing task before saving."));
      return;
    }
    if (mode === "save" && !unsavedWritingCount) {
      setMessage(tr("写作内容已经保存。你可以继续修改后再保存。", "Your writing is saved. Keep editing and save again any time."));
      return;
    }

    await saveStudentProfile();
    const activeSubmissionId = validSubmissionId(submissionId) || (await loadSubmissionDraft(true));
    if (mode === "submit" && !unsavedWritingCount) {
      await submitSavedWriting(activeSubmissionId);
      return;
    }
    const responses = writingTasks
      .filter((task) => changedWritingKeys.includes(task.key))
      .map((task) => ({
        taskKey: task.key,
        taskLabel: task.label,
        taskTitle: task.title,
        taskPrompt: task.prompt || "",
        responseText: writingDrafts[task.key].trim()
      }));

    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/student/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: assignment.id,
        submissionId: validSubmissionId(activeSubmissionId),
        studentName: studentName.trim(),
        mode,
        responses
      })
    });
    setSubmitting(false);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || tr("写作保存失败，请重试。", "Could not save the writing; try again."));
      return;
    }
    if (data.submissionId) {
      setSubmissionId(data.submissionId);
      window.history.replaceState(null, "", `/s/${assignment.id}?submissionId=${data.submissionId}`);
    }
    setSubmissionStatus(data.submissionStatus || (mode === "submit" ? "submitted" : "in_progress"));
    await loadSubmissionDraft();
    void loadStudentData();
    setMessage(mode === "submit" ? tr("已提交给老师。", "Submitted to your teacher.") : tr("已保存。下次打开仍有记录；点击提交后老师才能看到。", "Saved. It will still be here next time; the teacher sees it once you submit."));
  }

  async function submitSavedWriting(activeSubmissionId: string) {
    if (!activeSubmissionId) {
      setMessage(tr("没有找到已保存内容，请先保存写作。", "Nothing saved yet; save your writing first."));
      return;
    }
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/student/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: assignment.id, submissionId: activeSubmissionId, studentName: studentName.trim() })
    });
    setSubmitting(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || tr("提交失败。", "Submission failed."));
      return;
    }
    setSubmissionStatus(data.submissionStatus || "submitted");
    void loadStudentData();
    setMessage(tr("已提交给老师。", "Submitted to your teacher."));
  }

  // Decided on the server before the page was sent, so it renders on the first
  // paint instead of waiting for the account check to come back.
  if (accessDenied) {
    return (
      <main className="shell">
        <section className="auth-shell">
          <article className="card stack">
            <div>
              <h1>{t("无法查看该作业", "This homework is not yours")}</h1>
              <p className="hint">{t("该作业未分配到该账号下。如需切换账号，请先退出登录。", "It is not assigned to this account. Sign out to switch accounts.")}</p>
            </div>
            <StudentAccountBox
              account={account}
              authMode={authMode}
              phone={authPhone}
              name={authName}
              password={authPassword}
              submitting={submitting}
              setAuthMode={setAuthMode}
              setPhone={setAuthPhone}
              setName={setAuthName}
              setPassword={setAuthPassword}
              submitAuth={submitAuth}
              logout={logout}
            />
          </article>
        </section>
      </main>
    );
  }

  // The server already told us there is no session, so skip the flash of a
  // loading card and go straight to the sign-in form.
  if (!accountChecked && !needsSignIn) {
    return (
      <main className="shell">
        <article className="card stack">
          <h1>{t("加载中...", "Loading...")}</h1>
          <p className="hint">{t("正在检查学生账号。", "Checking your account.")}</p>
        </article>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="shell">
        <section className="auth-shell">
          <article className="card stack">
            <div>
              <h1>{t("学生登录", "Student sign-in")}</h1>
              <p className="hint">{t("请使用手机号登录或注册后查看这份作业。", "Sign in or sign up with your phone number to open this homework.")}</p>
            </div>
            <StudentAccountBox
              account={account}
              authMode={authMode}
              phone={authPhone}
              name={authName}
              password={authPassword}
              submitting={submitting}
              setAuthMode={setAuthMode}
              setPhone={setAuthPhone}
              setName={setAuthName}
              setPassword={setAuthPassword}
              submitAuth={submitAuth}
              logout={logout}
            />
            {message && <p className={message.includes("failed") || message.includes("incorrect") ? "error" : "hint"}>{message}</p>}
          </article>
        </section>
      </main>
    );
  }

  if (!canViewCurrentAssignment) {
    return (
      <main className="shell">
        <section className="auth-shell">
          <article className="card stack">
            <div>
              <h1>{t("无法查看该作业", "This homework is not yours")}</h1>
              <p className="hint">{t("该作业未分配到该账号下。如需切换账号，请先退出登录。", "It is not assigned to this account. Sign out to switch accounts.")}</p>
            </div>
            <StudentAccountBox
              account={account}
              authMode={authMode}
              phone={authPhone}
              name={authName}
              password={authPassword}
              submitting={submitting}
              setAuthMode={setAuthMode}
              setPhone={setAuthPhone}
              setName={setAuthName}
              setPassword={setAuthPassword}
              submitAuth={submitAuth}
              logout={logout}
            />
            <button className="btn secondary" disabled={historyLoading} onClick={() => loadStudentData(activeArea)} type="button">
              {historyLoading ? t("加载中...", "Loading...") : t("加载我的可完成作业", "Load my homework")}
            </button>
            {availableAssignments.length > 0 && (
              <AreaHomeworkList
                activeArea={activeArea}
                assignments={availableAssignments}
                currentAssignmentId={assignment.id}
                needsName={false}
              />
            )}
            {message && <p className={message.includes("failed") || message.includes("not assigned") ? "error" : "hint"}>{message}</p>}
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      {/* A homework link drops the student straight onto this page, and the
          only other way out was the wordmark, which goes to the marketing
          page rather than to their own. A full navigation is deliberate: the
          portal decides on the server what this account may see. */}
      <div className="crumb-bar">
        <a className="btn secondary" href="/student">
          {t("返回学生中心", "Back to student centre")}
        </a>
      </div>
      <section className="hero">
        <div>
          <h1>{isCurrentAreaAssignment ? assignment.title : areaTitle}</h1>
          <div className="area-label">{activeAreaIsWriting ? t("写作区", "Writing") : t("口语区", "Speaking")}</div>
          <p>
            {isCurrentAreaAssignment
              ? assignment.training_note
              : activeAreaIsWriting
                ? t("请在下方打开一项写作作业。", "Open a writing homework below.")
                : t("请在下方打开一项口语作业。", "Open a speaking homework below.")}
          </p>
        </div>
        <aside className="panel stack">
          <div className="section-head">
            <span className="muted">{t("创建日期", "Set on")}</span>
            <strong>{formatDate(assignment.created_at)}</strong>
          </div>
          <div className="section-head">
            <span className="muted">{t("截止日期", "Due")}</span>
            <strong>{assignmentDateLabel(assignment)}</strong>
          </div>
          <span className={`pill ${isCurrentAreaAssignment && isComplete ? "ok" : isCurrentAreaAssignment && (hasAnyRecording || hasAnyWriting) ? "warn" : ""}`}>
            {!isCurrentAreaAssignment ? t("选择作业", "Choose homework") : isComplete ? t("已完成", "Done") : hasAnyRecording || hasAnyWriting ? t("进行中", "In progress") : t("未完成", "Not started")}
          </span>
        </aside>
      </section>


      {/* The panel runs across the top so the homework and the teacher's
          feedback below it get the full width. */}
      <section className="single-column">
        <aside className="panel student-panel-bar">
          <div className="student-panel-group">
            <h2>{activeAreaIsWriting ? t("写作面板", "Writing") : t("口语面板", "Speaking")}</h2>
            <div className="view-switch">
              <button className={`btn ${view === "latest" ? "" : "secondary"}`} type="button" onClick={() => setView("latest")}>
                {LABEL_LATEST()}
              </button>
              <button className={`btn ${view === "history" ? "" : "secondary"}`} disabled={!studentName.trim() || historyLoading} onClick={openHistory} type="button">
                {historyLoading ? t("加载中...", "Loading...") : LABEL_HISTORY()}
              </button>
            </div>
          </div>
          <p className="hint student-panel-hint">
            {activeAreaIsWriting
              ? t("请在任务框内写作。你可以先保存单个任务，下次打开后继续修改。", "Write in each task box. You can save one task at a time and keep editing later.")
              : t("Part 1 和 Part 3 按题录音。Part 2 录制一段完整回答。保存前可以删除并重新录制。", "Record Part 1 and Part 3 question by question, and Part 2 as one answer. Delete and re-record before saving.")}
          </p>
          <div className="student-panel-status">
          {isCurrentAreaAssignment ? (
            <>
              <span className="pill">
                {isWriting ? t(`${savedWritingKeys.size}/${writingTasks.length} 项写作已保存`, `${savedWritingKeys.size}/${writingTasks.length} tasks saved`) : t(`${recordedKeys.size}/${items.length} 段录音`, `${recordedKeys.size}/${items.length} recorded`)}
              </span>
              {isWriting
                ? unsavedWritingCount > 0 && <span className="pill warn">{t(`${unsavedWritingCount} 项未保存`, `${unsavedWritingCount} unsaved`)}</span>
                : unsavedCount > 0 && <span className="pill warn">{t(`${unsavedCount} 段未保存`, `${unsavedCount} unsaved`)}</span>}
              {!isWriting && uploadTotalCount > 0 && (
                <span className={`pill ${uploadFailedCount ? "danger" : uploadDoneCount === uploadTotalCount ? "ok" : "warn"}`}>
                  {t(`上传进度：${uploadDoneCount}/${uploadTotalCount}${uploadFailedCount ? `，${uploadFailedCount} 段失败` : ""}`, `Uploaded ${uploadDoneCount}/${uploadTotalCount}${uploadFailedCount ? `, ${uploadFailedCount} failed` : ""}`)}
                </span>
              )}
              <span className={`pill ${submissionStatus === "in_progress" ? "warn" : "ok"}`}>{submissionStatus === "reviewed" ? t("已批改", "Marked") : submissionStatus === "submitted" ? t("已提交", "Submitted") : t("草稿未提交", "Draft, not submitted")}</span>
            </>
          ) : (
            <span className="pill">{activeAreaIsWriting ? t("请在下方打开一项写作作业", "Open a writing homework below") : t("请在下方打开一项口语作业", "Open a speaking homework below")}</span>
          )}
          </div>
          {message && <p className={message.includes("failed") ? "error" : "hint"}>{message}</p>}
          {isCurrentAreaAssignment ? (
            isWriting ? (
              <div className="practice-save-actions">
                <button
                  className="btn secondary"
                  disabled={!hasAnyWriting || submitting || !unsavedWritingCount}
                  onClick={() => void saveWriting("save")}
                  type="button"
                >
                  {submitting ? t("保存中...", "Saving...") : t("保存写作", "Save writing")}
                </button>
                <button
                  className="btn"
                  disabled={!hasAnyWriting || submitting}
                  onClick={() => void saveWriting("submit")}
                  type="button"
                >
                  {submitting ? t("提交中...", "Submitting...") : t("提交给老师", "Submit to teacher")}
                </button>
              </div>
            ) : (
              <div className="practice-save-actions">
                <button
                  className="btn secondary"
                  disabled={!hasAnyRecording || submitting || isPreparingRecording || !unsavedCount}
                  onClick={saveRecordings}
                  type="button"
                >
                  {submitting ? t("保存中...", "Saving...") : isPreparingRecording ? t("正在准备录音...", "Preparing audio...") : t("保存已录内容", "Save recordings")}
                </button>
                <button
                  className="btn"
                  disabled={submitting || isPreparingRecording || Boolean(unsavedCount) || !Object.keys(savedRecordings).length}
                  onClick={submitHomework}
                  type="button"
                >
                  {submitting ? t("提交中...", "Submitting...") : t("提交给老师", "Submit to teacher")}
                </button>
              </div>
            )
          ) : (
            <button className="btn secondary" disabled={!studentName.trim() || historyLoading} onClick={() => loadStudentData(activeArea)} type="button">
              {historyLoading ? t("加载中...", "Loading...") : activeAreaIsWriting ? t("加载写作作业", "Load writing homework") : t("加载口语作业", "Load speaking homework")}
            </button>
          )}
        </aside>

        <div className="stack">
          {view === "latest" && !isCurrentAreaAssignment ? (
            <AreaHomeworkList
              activeArea={activeArea}
              assignments={availableAssignments}
              currentAssignmentId={assignment.id}
              needsName={!studentName.trim()}
            />
          ) : view === "latest" ? (
            isWriting ? (
              <LatestWritingView
                tasks={writingTasks}
                drafts={writingDrafts}
                savedResponses={savedWritingResponses}
                setDraft={(taskKey, value) => setWritingDrafts((current) => ({ ...current, [taskKey]: value }))}
                publishedFeedback={currentFeedback}
              />
            ) : (
              <LatestAssignmentView
                assignment={assignment}
                items={items}
                recordings={recordings}
                savedRecordings={savedRecordings}
                uploadStatuses={uploadStatuses}
                seconds={seconds}
                activeKey={activeKey}
                processingRecordingKey={processingRecordingKey}
                p1Count={p1Count}
                p3Count={p3Count}
                toggleRecording={toggleRecording}
                deleteRecording={deleteRecording}
                uploadRecordingFile={uploadRecordingFile}
                publishedFeedback={currentFeedback}
              />
            )
          ) : (
            <HistoryView currentAssignmentId={assignment.id} activeArea={activeArea} submissions={history} assignments={availableAssignments} />
          )}
        </div>
      </section>
    </main>
  );
}

function StudentAccountBox({
  account,
  authMode,
  phone,
  name,
  password,
  submitting,
  setAuthMode,
  setPhone,
  setName,
  setPassword,
  submitAuth,
  logout
}: {
  account: AuthAccount | null;
  authMode: "login" | "register";
  phone: string;
  name: string;
  password: string;
  submitting: boolean;
  setAuthMode: (mode: "login" | "register") => void;
  setPhone: (value: string) => void;
  setName: (value: string) => void;
  setPassword: (value: string) => void;
  submitAuth: () => void;
  logout: () => void;
}) {
  const { t } = useLanguage();
  if (account) {
    return (
      <div className="account-box">
        <label>{t("学生账号", "Student account")}</label>
        <strong>{account.display_name}</strong>
        <p className="hint">{account.phone}</p>
        <button className="btn secondary" type="button" onClick={logout}>
          {t("退出登录", "Sign out")}
        </button>
      </div>
    );
  }

  return (
    <div className="account-box">
      <label>{t("学生账号", "Student account")}</label>
      <div className="segmented">
        <button className={`btn ${authMode === "login" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("login")}>
          {t("登录", "Sign in")}
        </button>
        <button className={`btn ${authMode === "register" ? "" : "secondary"}`} type="button" onClick={() => setAuthMode("register")}>
          {t("注册", "Sign up")}
        </button>
      </div>
      <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("手机号", "Phone number")} />
      {authMode === "register" && (
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("学生姓名", "Your name")} />
      )}
      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("密码", "Password")} />
      <button className="btn" disabled={submitting || !phone || !password || (authMode === "register" && !name)} type="button" onClick={submitAuth}>
        {submitting ? t("处理中...", "Working...") : authMode === "login" ? t("登录", "Sign in") : t("创建学生账号", "Create account")}
      </button>
    </div>
  );
}

function canStudentViewAssignment(studentName: string, assignedStudents: string[]) {
  if (!assignedStudents.length) return true;
  const normalizedStudent = normalizeStudentName(studentName);
  if (!normalizedStudent) return false;
  return assignedStudents.some((student) => normalizeStudentName(student) === normalizedStudent);
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}

function validSubmissionId(value?: string | null) {
  const cleaned = (value || "").trim();
  if (!cleaned || cleaned === "null" || cleaned === "undefined") return "";
  return cleaned;
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

function AreaHomeworkList({
  activeArea,
  assignments,
  currentAssignmentId,
  needsName
}: {
  activeArea: "speaking" | "writing";
  assignments: StudentAssignmentSummary[];
  currentAssignmentId: string;
  needsName: boolean;
}) {
  const { t } = useLanguage();
  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>{activeArea === "writing" ? t("写作作业", "Writing homework") : t("口语作业", "Speaking homework")}</h2>
          <div className="hint">{activeArea === "writing" ? t("这里只显示写作作业。", "Writing homework only.") : t("这里只显示口语作业。", "Speaking homework only.")}</div>
        </div>
        <span className="pill">{t(`${assignments.length} 项`, `${assignments.length}`)}</span>
      </div>
      {needsName ? (
        <p className="hint">{t("请先输入姓名，再加载该板块作业。", "Enter your name, then load this area's homework.")}</p>
      ) : assignments.length ? (
        assignments.map((item) => (
          <a className={`submission-row ${item.id === currentAssignmentId ? "active" : ""}`} href={`/s/${item.id}`} key={item.id}>
            <strong>{item.title}</strong>
            <span className="hint">{t("创建日期：", "Set on: ")}{formatDate(item.created_at)}</span>
            <span className="hint">{t("截止日期：", "Due: ")}{assignmentDateLabel(item)}</span>
          </a>
        ))
      ) : (
        <p className="hint">{activeArea === "writing" ? t("该姓名下暂时没有写作作业。", "No writing homework under this name.") : t("该姓名下暂时没有口语作业。", "No speaking homework under this name.")}</p>
      )}
    </article>
  );
}

function LatestWritingView({
  tasks,
  drafts,
  savedResponses,
  setDraft,
  publishedFeedback
}: {
  tasks: WritingTask[];
  drafts: Record<string, string>;
  savedResponses: Record<string, WritingResponse>;
  setDraft: (taskKey: string, value: string) => void;
  publishedFeedback?: Feedback | null;
}) {
  const { t } = useLanguage();
  return (
    <>
      <article className="card stack">
        <div className="section-head">
          <div>
            <h2>{t("写作", "Writing")}</h2>
            <div className="hint">{t("你可以先保存单个任务，稍后继续完成。", "Save one task at a time and come back to finish.")}</div>
          </div>
          <span className="pill">{`${Object.keys(savedResponses).length}/${tasks.length}`}</span>
        </div>
        {tasks.map((task) => {
          const value = drafts[task.key] ?? savedResponses[task.key]?.response_text ?? "";
          const savedValue = savedResponses[task.key]?.response_text || "";
          const changed = value.trim() && value !== savedValue;

          return (
            <article className="question-card writing-task-card" key={task.key}>
              <div className="writing-task-brief">
                <div className="hint">{task.label}</div>
                <div className="question-title">{task.title}</div>
                {task.word_limit && <span className="pill">{task.word_limit}</span>}
                <p className="writing-task-prompt">{task.prompt}</p>
                {task.image_urls?.length ? <WritingTaskImages imageUrls={task.image_urls} /> : null}
              </div>
              <div className="writing-task-answer">
                <textarea
                  className="writing-answer"
                  value={value}
                  onChange={(event) => setDraft(task.key, event.target.value)}
                  placeholder={t("请在这里输入你的作文...", "Write your essay here...")}
                />
                <div className="section-head compact">
                  <span className="hint">{t(`${value.trim().split(/\s+/).filter(Boolean).length} 词`, `${value.trim().split(/\s+/).filter(Boolean).length} words`)}</span>
                  {savedResponses[task.key] && !changed ? <span className="pill ok">{t("已保存到账号", "Saved")}</span> : null}
                  {changed ? <span className="pill warn">{t("尚未保存", "Unsaved")}</span> : null}
                </div>
              </div>
            </article>
          );
        })}
      </article>
      {publishedFeedback && <PublishedFeedback feedback={publishedFeedback} />}
    </>
  );
}

function WritingTaskImages({ imageUrls }: { imageUrls: string[] }) {
  return (
    <div className="task-image-grid">
      {imageUrls.map((imageUrl) => (
        <img alt={tr("Writing Task 1 题目图片", "Writing Task 1 figure")} className="task-image" key={imageUrl} src={imageUrl} />
      ))}
    </div>
  );
}

function LatestAssignmentView({
  assignment,
  items,
  recordings,
  savedRecordings,
  uploadStatuses,
  seconds,
  activeKey,
  processingRecordingKey,
  p1Count,
  p3Count,
  toggleRecording,
  deleteRecording,
  uploadRecordingFile,
  publishedFeedback
}: {
  assignment: Assignment;
  items: QuestionItem[];
  recordings: Record<string, LocalRecording>;
  savedRecordings: Record<string, Recording>;
  uploadStatuses: Record<string, UploadStatus>;
  seconds: Record<string, number>;
  activeKey: string | null;
  processingRecordingKey: string | null;
  p1Count: number;
  p3Count: number;
  toggleRecording: (key: string) => void;
  deleteRecording: (key: string) => void;
  uploadRecordingFile: (key: string, file?: File) => void;
  publishedFeedback?: Feedback | null;
}) {
  const { t } = useLanguage();
  const recordedKeys = new Set([...Object.keys(savedRecordings), ...Object.keys(recordings)]);

  return (
    <>
      {/* Feedback first once it exists: it is what the student came back for,
          and it used to sit below every recording. */}
      {publishedFeedback && (
        <PublishedFeedback feedback={publishedFeedback} recordings={Object.values(savedRecordings)} />
      )}

      <PartBlock title="Part 1" hint={t("建议每题回答 20-40 秒。", "Aim for 20–40 seconds per question.")} progress={`${p1Count}/${assignment.p1_questions.length}`}>
        {items
          .filter((item) => item.part === "p1")
          .map((item, index) => (
            <RecorderCard
              key={item.key}
              number={index + 1}
              item={item}
              recording={recordings[item.key]}
              savedRecording={savedRecordings[item.key]}
              uploadStatus={uploadStatuses[item.key]}
              duration={recordings[item.key]?.duration ?? seconds[item.key] ?? 0}
              active={activeKey === item.key}
              processing={processingRecordingKey === item.key}
              onRecord={() => toggleRecording(item.key)}
              onDelete={() => deleteRecording(item.key)}
              onUpload={(file) => void uploadRecordingFile(item.key, file)}
              showTeacherDemo={Boolean(publishedFeedback?.published_at)}
            />
          ))}
      </PartBlock>

      <PartBlock title="Part 2" hint={t("准备 1 分钟，然后回答约 1.5-2 分钟。", "Prepare for 1 minute, then speak for 1.5–2 minutes.")} progress={recordedKeys.has("p2") ? "1/1" : "0/1"}>
        {items
          .filter((item) => item.part === "p2")
          .map((item) => (
            <RecorderCard
              key={item.key}
              item={item}
              recording={recordings[item.key]}
              savedRecording={savedRecordings[item.key]}
              uploadStatus={uploadStatuses[item.key]}
              duration={recordings[item.key]?.duration ?? seconds[item.key] ?? 0}
              active={activeKey === item.key}
              processing={processingRecordingKey === item.key}
              onRecord={() => toggleRecording(item.key)}
              onDelete={() => deleteRecording(item.key)}
              onUpload={(file) => void uploadRecordingFile(item.key, file)}
              showTeacherDemo={Boolean(publishedFeedback?.published_at)}
            />
          ))}
      </PartBlock>

      <PartBlock title="Part 3" hint={t("建议每题回答 40-60 秒。", "Aim for 40–60 seconds per question.")} progress={`${p3Count}/${assignment.p3_questions.length}`}>
        {items
          .filter((item) => item.part === "p3")
          .map((item, index) => (
            <RecorderCard
              key={item.key}
              number={index + 1}
              item={item}
              recording={recordings[item.key]}
              savedRecording={savedRecordings[item.key]}
              uploadStatus={uploadStatuses[item.key]}
              duration={recordings[item.key]?.duration ?? seconds[item.key] ?? 0}
              active={activeKey === item.key}
              processing={processingRecordingKey === item.key}
              onRecord={() => toggleRecording(item.key)}
              onDelete={() => deleteRecording(item.key)}
              onUpload={(file) => void uploadRecordingFile(item.key, file)}
              showTeacherDemo={Boolean(publishedFeedback?.published_at)}
            />
          ))}
      </PartBlock>
    </>
  );
}

function PartBlock({
  title,
  hint,
  progress,
  children
}: {
  title: string;
  hint: string;
  progress: string;
  children: React.ReactNode;
}) {
  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <div className="hint">{hint}</div>
        </div>
        <span className="pill">{progress}</span>
      </div>
      {children}
    </article>
  );
}

function RecorderCard({
  number,
  item,
  recording,
  savedRecording,
  uploadStatus,
  duration,
  active,
  processing,
  onRecord,
  onDelete,
  onUpload,
  showTeacherDemo
}: {
  number?: number;
  item: QuestionItem;
  recording?: LocalRecording;
  savedRecording?: Recording;
  uploadStatus?: UploadStatus;
  duration: number;
  active: boolean;
  processing: boolean;
  onRecord: () => void;
  onDelete: () => void;
  onUpload: (file?: File) => void;
  showTeacherDemo?: boolean;
}) {
  const { t } = useLanguage();
  const audioUrl = recording?.url || savedRecording?.signed_url || "";
  const displayDuration = recording?.duration ?? savedRecording?.duration_seconds ?? duration;

  return (
    <div className="question-card">
      <div>
        <div className="hint">{item.label}</div>
        <div className="question-title">
          {number ? `${number}. ` : ""}
          {item.question}
        </div>
      </div>
      <div className="recorder-row">
        <button className={`btn ${active ? "danger" : "rec"}`} disabled={processing} onClick={onRecord} type="button">
          {active ? t("停止录音", "Stop") : processing ? t("准备中...", "Preparing...") : t("开始录音", "Record")}
        </button>
        <button className="btn danger" disabled={!recording} onClick={onDelete} type="button">
          {t("删除", "Delete")}
        </button>
        <label className="file-upload">
          {t("上传音频", "Upload audio")}
          <input accept="audio/*" type="file" onChange={(event) => onUpload(event.target.files?.[0])} />
        </label>
        {audioUrl ? <audio controls src={audioUrl} /> : <span className="hint">{t("还没有录音", "No recording yet")}</span>}
        <span className="timer">{formatTime(displayDuration)}</span>
      </div>
      {savedRecording && !recording && <span className="pill ok">{t("已保存到账号", "Saved")}</span>}
      {recording && <span className="pill warn">{t("尚未保存", "Unsaved")}</span>}
      {processing && <span className="pill warn">{t("正在准备音频...", "Preparing audio...")}</span>}
      {uploadStatus?.status === "queued" && <span className="pill warn">{t("等待上传", "Queued")}</span>}
      {uploadStatus?.status === "uploading" && <span className="pill warn">{uploadStatus.message || t("上传中...", "Uploading...")}</span>}
      {uploadStatus?.status === "done" && <span className="pill ok">{t("已上传", "Uploaded")}</span>}
      {uploadStatus?.status === "failed" && <span className="pill danger">{t("上传失败", "Upload failed")}</span>}
      {uploadStatus?.status === "failed" && uploadStatus.message && <p className="error">{uploadStatus.message}</p>}
      {showTeacherDemo && savedRecording?.teacher_demo?.signed_url && (
        <div className="inline-comment">
          <label>{t("老师示范回答", "Teacher's sample answer")}</label>
          <audio controls src={savedRecording.teacher_demo.signed_url} />
          <p className="hint">{t("可以先听示范回答，准备好后删除原录音并重新录制这一题。", "Listen to the sample first, then delete your recording and record this question again.")}</p>
        </div>
      )}
    </div>
  );
}

function HistoryView({
  currentAssignmentId,
  activeArea,
  submissions,
  assignments
}: {
  currentAssignmentId: string;
  activeArea: "speaking" | "writing";
  submissions: Submission[];
  assignments: StudentAssignmentSummary[];
}) {
  const { t } = useLanguage();
  const submittedAssignmentIds = new Set(submissions.map((submission) => submission.assignment_id));
  const currentFirst = assignments
    .slice()
    .sort((a, b) => (a.id === currentAssignmentId ? -1 : b.id === currentAssignmentId ? 1 : 0));

  return (
    <div className="stack">
      <article className="card stack">
        <div className="section-head">
          <div>
            <h2>{LABEL_AVAILABLE()}</h2>
            <div className="hint">{activeArea === "writing" ? t("这里只显示分配给该学生的写作作业。", "Writing homework assigned to you.") : t("这里只显示分配给该学生的口语作业。", "Speaking homework assigned to you.")}</div>
          </div>
          <span className="pill">{t(`${assignments.length} 项`, `${assignments.length}`)}</span>
        </div>
        {currentFirst.length ? (
          currentFirst.map((item) => (
            <a className={`submission-row ${item.id === currentAssignmentId ? "active" : ""}`} href={`/s/${item.id}`} key={item.id}>
              <strong>{item.title}</strong>
              <span className="hint">{t("创建日期：", "Set on: ")}{formatDate(item.created_at)}</span>
              <span className="hint">{t("截止日期：", "Due: ")}{assignmentDateLabel(item)}</span>
              <span className={`pill ${submittedAssignmentIds.has(item.id) ? "ok" : "warn"}`}>
                {submittedAssignmentIds.has(item.id) ? t("已提交", "Submitted") : t("未提交", "Not submitted")}
              </span>
            </a>
          ))
        ) : (
          <p className="hint">{t("当前没有可完成的作业。", "Nothing to do right now.")}</p>
        )}
      </article>

      <LearningProgressPanel submissions={submissions} />

      <article className="card stack">
        <div className="section-head">
          <div>
            <h2>{LABEL_HISTORY()}</h2>
            <div className="hint">{t("打开作业标题即可查看历史录音/作文和已发布反馈。", "Open a title to see the recordings or essay and the published feedback.")}</div>
          </div>
          <span className="pill">{t(`${submissions.length} 次提交`, `${submissions.length} submissions`)}</span>
        </div>
        {submissions.length ? (
          submissions.map((submission) => (
            <HistoryCard key={submission.id} submission={submission} current={submission.assignment_id === currentAssignmentId} />
          ))
        ) : (
          <p className="hint">{t("还没有提交记录。未完成作业显示在上方。", "No submissions yet. Unfinished homework is listed above.")}</p>
        )}
      </article>
    </div>
  );
}

function HistoryCard({ submission, current }: { submission: Submission; current: boolean }) {
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  const { t, language } = useLanguage();
  const title = submission.submission_title || assignment?.title || t("作业", "Homework");
  const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null;
  const isWriting = assignment?.assignment_type === "writing" || Boolean(submission.writing_responses?.length);

  return (
    <details className="history-card">
      <summary>
        <div>
          <h3>{title}</h3>
          <div className="hint">{new Date(submission.submitted_at).toLocaleString(language === "zh" ? "zh-CN" : "en-GB")}</div>
        </div>
        <span className={`pill ${feedback?.published_at ? "ok" : current ? "warn" : ""}`}>
          {feedback?.published_at ? t("已批改", "Marked") : current ? t("当前作业", "Current") : t("已提交", "Submitted")}
        </span>
      </summary>
      {feedback?.published_at && (
        <PublishedFeedback feedback={feedback} recordings={submission.recordings || []} compact />
      )}
      <div className="stack">
        {isWriting
          ? (submission.writing_responses || []).map((response) => (
              <HistoryWritingResponse
                key={response.id}
                response={response}
                imageUrls={(assignment?.writing_tasks || []).find((task) => task.key === response.task_key)?.image_urls || []}
                feedback={feedback}
                showRevision={Boolean(feedback?.published_at)}
              />
            ))
          : (submission.recordings || []).map((recording) => (
              <HistoryRecording
                key={recording.id}
                recording={recording}
                feedback={feedback}
                showTranscript={Boolean(feedback?.published_at)}
              />
            ))}
      </div>
      {!feedback?.published_at && <p className="hint">{t("老师还没有发布反馈。", "No feedback published yet.")}</p>}
    </details>
  );
}

function HistoryWritingResponse({
  response,
  imageUrls,
  feedback,
  showRevision
}: {
  response: WritingResponse;
  imageUrls: string[];
  feedback: Feedback | null;
  showRevision: boolean;
}) {
  const editedText = response.teacher_revision_text || response.response_text || "";
  const comments = feedback?.published_at ? questionCommentDetails(feedback.details || []) : [];
  const comment = comments.find((detail) => detail.part === `comment:${response.task_key}`);
  const reviewComment = parseReviewComment(comment?.comment || "");

  return (
    <div className="history-recording">
      <div>
        <div className="hint">{response.task_label}</div>
        <div className="question-title">{response.task_title}</div>
        {imageUrls.length ? <WritingTaskImages imageUrls={imageUrls} /> : null}
        <p className="hint">{response.task_prompt}</p>
      </div>
      <div className="writing-text">{response.response_text}</div>
      {showRevision && <TranscriptDiff original={response.response_text} edited={editedText} />}
      {comment && (
        <div className="inline-comment">
          <label>{tr("老师对这项写作的点评", "Teacher's comment on this task")}</label>
          <p className="hint">{reviewComment.general || tr("暂无点评。", "No comment.")}</p>
          {reviewComment.inlineComments.length ? (
            <div className="writing-comment-list">
              {reviewComment.inlineComments.map((item, index) => (
                <div className="writing-comment-bubble" key={item.id}>
                  <div className="comment-anchor">{tr("批注", "Note")} {index + 1}</div>
                  <blockquote>{item.quote}</blockquote>
                  <p className="hint">{item.comment}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function HistoryRecording({
  recording,
  feedback,
  showTranscript
}: {
  recording: Recording;
  feedback: Feedback | null;
  showTranscript: boolean;
}) {
  const editedTranscript = recording.corrected_transcript_text || recording.transcript_text || "";
  const comments = feedback?.published_at ? questionCommentDetails(feedback.details || []) : [];
  const comment = comments.find((detail) => detail.part === `comment:${recording.question_key}`);

  return (
    <div className="history-recording">
      <div>
        <div className="hint">
          {recording.question_label} | {formatTime(recording.duration_seconds)}
        </div>
        <div className="question-title">{recording.question_text}</div>
      </div>
      {recording.signed_url ? <audio controls src={recording.signed_url} /> : <p className="hint">{tr("录音链接暂时不可用。", "The recording is not available right now.")}</p>}
      {showTranscript && recording.transcript_text && (
        <TranscriptDiff original={recording.transcript_text} edited={editedTranscript} />
      )}
      {feedback?.published_at && recording.teacher_demo?.signed_url && (
        <div className="inline-comment">
          <label>{tr("老师示范回答", "Teacher's sample answer")}</label>
          <audio controls src={recording.teacher_demo.signed_url} />
          <p className="hint">{tr("你可以把它作为参考答案，再回到最新作业页面重新录制这一题。", "Use it as a model, then go back to the latest homework and record this question again.")}</p>
        </div>
      )}
      {comment && <SpeakingCommentView value={comment.comment} />}
    </div>
  );
}

/** The teacher's comment on one question, plus any notes tied to a passage. */
function SpeakingCommentView({ value }: { value: string }) {
  const review = parseReviewComment(value);

  return (
    <div className="inline-comment">
      <label>{tr("老师对这一题的点评", "Teacher's comment on this question")}</label>
      <p className="hint">{review.general || tr("暂无点评。", "No comment.")}</p>
      {review.inlineComments.length ? (
        <div className="writing-comment-list">
          {review.inlineComments.map((item, index) => (
            <div className="writing-comment-bubble" key={item.id}>
              <div className="comment-anchor">{tr("批注", "Note")} {index + 1}</div>
              <blockquote>{item.quote}</blockquote>
              <p className="hint">{item.comment}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PublishedFeedback({
  feedback,
  recordings = [],
  compact = false
}: {
  feedback: Feedback;
  /** Lets each comment show the transcript it refers to, as the teacher saw it. */
  recordings?: Recording[];
  compact?: boolean;
}) {
  const scores = scoreDetails(feedback.details || []);
  const comments = questionCommentDetails(feedback.details || []);
  const recordingsByKey = new Map(recordings.map((recording) => [recording.question_key, recording]));
  return (
    <article className={`${compact ? "feedback-compact" : "card"} stack`}>
      <div className="section-head">
        <div>
          <h2>{tr("老师反馈", "Teacher's feedback")}</h2>
          <div className="hint">{tr("这是老师已发布的本次作业反馈。", "The feedback your teacher published for this homework.")}</div>
        </div>
        <span className="pill ok">{tr("已批改", "Marked")}</span>
      </div>
      <div className="overall">
        <div className="overall-score">
          <span>{tr("平均分", "Average")}</span>
          <strong>{(feedback.overall_score || averageScore(scores)).toFixed(1)}</strong>
        </div>
        <p>{feedback.overall_comment}</p>
      </div>
      <div className="stack">
        <label>{tr("评分", "Scores")}</label>
        {scores.map((detail: FeedbackDetail) => (
          <article className="detail-item" key={detail.part}>
            <div className="detail-head">
              <strong>{detail.label}</strong>
              <span className="pill">{Number(detail.score).toFixed(1)}</span>
            </div>
            <p className="hint">{detail.question}</p>
          </article>
        ))}
      </div>
      <div className="stack">
        <label>{tr("逐题点评", "Comments by question")}</label>
        {comments.map((detail: FeedbackDetail) => {
          // Comment parts are keyed "comment:<question_key>".
          const questionKey = detail.part.replace(/^comment:/, "");
          const recording = recordingsByKey.get(questionKey);
          const review = parseReviewComment(detail.comment);

          return (
            <article className="detail-item" key={detail.part}>
              <div>
                <div className="hint">{detail.label}</div>
                <div className="question-title">{detail.question}</div>
              </div>

              {recording?.transcript_text ? (
                <div className="student-review-workspace">
                  <div className="student-review-main">
                    <div className="hint">{tr("老师修改后的转写（绿色为新增，红色删除线为删去）", "Transcript with the teacher's edits (green added, red struck out)")}</div>
                    <div className="tracked-text">
                      <TrackedText
                        original={recording.transcript_text}
                        edited={recording.corrected_transcript_text || recording.transcript_text}
                      />
                    </div>
                  </div>
                  {review.inlineComments.length ? (
                    <aside className="student-comment-sidebar">
                      <div className="hint">{tr("批注", "Notes")} {review.inlineComments.length}</div>
                      {review.inlineComments.map((item) => (
                        <div className="inline-comment-card" key={item.id}>
                          <blockquote>{item.quote}</blockquote>
                          <p className="hint">{item.comment}</p>
                        </div>
                      ))}
                    </aside>
                  ) : null}
                </div>
              ) : (
                review.inlineComments.map((item) => (
                  <div className="inline-comment-card" key={item.id}>
                    <blockquote>{item.quote}</blockquote>
                    <p className="hint">{item.comment}</p>
                  </div>
                ))
              )}

              <p className="hint">{review.general || tr("暂无点评。", "No comment.")}</p>
            </article>
          );
        })}
      </div>
    </article>
  );
}

function stopTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current) {
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }
  if (mimeType.includes("aac")) {
    return "aac";
  }
  if (mimeType.includes("mpeg")) {
    return "mp3";
  }
  return "webm";
}

/**
 * How long an uploaded audio file actually runs, in seconds.
 *
 * Returns 0 rather than throwing when the browser cannot tell — a student
 * should never be blocked from submitting because the length could not be
 * read, and the caller has a floor for that case.
 */
function readAudioDuration(url: string) {
  return new Promise<number>((resolve) => {
    const audio = new Audio();
    let settled = false;

    const done = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };

    // Metadata for a local file is immediate; this only catches a file the
    // browser cannot decode at all, so that the upload is not left hanging.
    const timer = window.setTimeout(() => done(0), 4000);

    audio.onerror = () => done(0);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) return done(audio.duration);
      // A WebM recorded elsewhere often reports Infinity until the browser has
      // seen the end of the stream. Seeking past it forces the real value.
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null;
        done(audio.duration);
      };
      audio.currentTime = 1e101;
    };

    audio.preload = "metadata";
    audio.src = url;
  });
}

function formatTime(total: number) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
