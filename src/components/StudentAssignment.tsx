"use client";

import { useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Assignment, Feedback, FeedbackDetail, QuestionItem, Recording, Submission } from "@/lib/types";
import { questionCommentDetails, scoreDetails } from "@/lib/feedback";
import { averageScore, getQuestionItems } from "@/lib/questions";
import { LearningProgressPanel } from "@/components/LearningProgress";

type LocalRecording = {
  blob: Blob;
  url: string;
  duration: number;
};

type StudentAssignmentSummary = Pick<Assignment, "id" | "title" | "deadline_text" | "created_at">;

const LABEL_LATEST = "\u67e5\u770b\u6700\u65b0\u4f5c\u4e1a";
const LABEL_HISTORY = "\u67e5\u770b\u5386\u53f2\u4f5c\u4e1a";
const LABEL_AVAILABLE = "\u53ef\u5b8c\u6210\u4f5c\u4e1a";
const LABEL_PROGRESS = "\u5b66\u4e60\u60c5\u51b5";

export function StudentAssignment({
  assignment,
  publishedFeedback
}: {
  assignment: Assignment;
  publishedFeedback?: Feedback | null;
}) {
  const items = useMemo(() => getQuestionItems(assignment), [assignment]);
  const [studentName, setStudentName] = useState("");
  const [recordings, setRecordings] = useState<Record<string, LocalRecording>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<Submission[]>([]);
  const [availableAssignments, setAvailableAssignments] = useState<StudentAssignmentSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [view, setView] = useState<"latest" | "history">("latest");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const isComplete = items.every((item) => recordings[item.key]);
  const p1Count = items.filter((item) => item.part === "p1" && recordings[item.key]).length;
  const p3Count = items.filter((item) => item.part === "p3" && recordings[item.key]).length;

  async function toggleRecording(key: string) {
    if (activeKey) {
      if (activeKey !== key) {
        setMessage("Stop the current recording before starting another question.");
        return;
      }

      recorderRef.current?.stop();
      stopTimer(timerRef);
      setActiveKey(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser does not support web recording. Please use Chrome, Edge, or Safari.");
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
      };

      recorder.start(1000);
    } catch {
      setMessage("Microphone permission was not granted. Please allow microphone access and try again.");
    }
  }

  function deleteRecording(key: string) {
    setRecordings((current) => {
      current[key]?.url && URL.revokeObjectURL(current[key].url);
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSeconds((current) => ({ ...current, [key]: 0 }));
  }

  function uploadRecordingFile(key: string, file?: File) {
    if (!file) return;
    setRecordings((current) => {
      current[key]?.url && URL.revokeObjectURL(current[key].url);
      return {
        ...current,
        [key]: {
          blob: file,
          url: URL.createObjectURL(file),
          duration: Math.max(seconds[key] || 0, 1)
        }
      };
    });
    setMessage("Audio file added. You can submit after every question has a recording or uploaded file.");
  }

  async function loadStudentData() {
    if (!studentName.trim()) {
      setMessage("Please enter your name first.");
      return;
    }

    setHistoryLoading(true);
    setMessage("");
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
      setMessage(historyData.error || "Could not load previous homework.");
      return;
    }
    if (!assignmentsResponse.ok) {
      setMessage(assignmentsData.error || "Could not load homework list.");
      return;
    }

    setHistory(historyData.submissions || []);
    setAvailableAssignments(assignmentsData.assignments || []);
  }

  async function openHistory() {
    setView("history");
    await loadStudentData();
  }

  async function submit() {
    if (!studentName.trim()) {
      setMessage("Please enter your name first.");
      return;
    }
    if (!isComplete) {
      setMessage("Please record every question before submitting.");
      return;
    }

    const formData = new FormData();
    formData.append("assignmentId", assignment.id);
    formData.append("studentName", studentName.trim());
    formData.append("items", JSON.stringify(items));

    items.forEach((item) => {
      const recording = recordings[item.key];
      formData.append(`audio_${item.key}`, recording.blob, `${item.key}.${audioExtension(recording.blob.type)}`);
      formData.append(`duration_${item.key}`, String(recording.duration));
    });

    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/student/submit", {
      method: "POST",
      body: formData
    });
    setSubmitting(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const details =
        Array.isArray(data.failures) && data.failures.length
          ? ` Details: ${data.failures.map((failure: { label: string; error: string }) => `${failure.label}: ${failure.error}`).join("; ")}`
          : "";
      setMessage(
        `${data.error || "Submission failed. Please try again. If this repeats, re-record and submit again."}${details}`
      );
      return;
    }

    const data = await response.json();
    if (data.submissionId) {
      window.history.replaceState(null, "", `/s/${assignment.id}?submissionId=${data.submissionId}`);
    }
    void loadStudentData();
    setMessage("Submitted. Refresh this link after your teacher publishes feedback.");
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>{assignment.title}</h1>
          <p>{assignment.training_note}</p>
        </div>
        <aside className="panel stack">
          <div>
            <label>Student name</label>
            <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Enter your name" />
          </div>
          <div className="section-head">
            <span className="muted">Deadline</span>
            <strong>{assignment.deadline_text}</strong>
          </div>
          <span className={`pill ${isComplete ? "ok" : ""}`}>{isComplete ? "Ready to submit" : "Incomplete"}</span>
        </aside>
      </section>

      <section className="grid">
        <aside className="panel stack">
          <h2>Student panel</h2>
          <div className="view-switch">
            <button className={`btn ${view === "latest" ? "" : "secondary"}`} type="button" onClick={() => setView("latest")}>
              {LABEL_LATEST}
            </button>
            <button className={`btn ${view === "history" ? "" : "secondary"}`} disabled={!studentName.trim() || historyLoading} onClick={openHistory} type="button">
              {historyLoading ? "Loading..." : LABEL_HISTORY}
            </button>
          </div>
          <p className="hint">
            Part 1 and Part 3 are recorded question by question. Part 2 is one complete cue-card answer. You can delete
            and re-record before submitting.
          </p>
          <span className="pill">{`${Object.keys(recordings).length}/${items.length} recordings`}</span>
          {message && <p className={message.includes("failed") ? "error" : "hint"}>{message}</p>}
          <button className="btn" disabled={!isComplete || !studentName.trim() || submitting} onClick={submit}>
            {submitting ? "Submitting..." : "Submit homework"}
          </button>
        </aside>

        <div className="stack">
          {view === "latest" ? (
            <LatestAssignmentView
              assignment={assignment}
              items={items}
              recordings={recordings}
              seconds={seconds}
              activeKey={activeKey}
              p1Count={p1Count}
              p3Count={p3Count}
              toggleRecording={toggleRecording}
              deleteRecording={deleteRecording}
              uploadRecordingFile={uploadRecordingFile}
              publishedFeedback={publishedFeedback}
            />
          ) : (
            <HistoryView currentAssignmentId={assignment.id} submissions={history} assignments={availableAssignments} />
          )}
        </div>
      </section>
    </main>
  );
}

function LatestAssignmentView({
  assignment,
  items,
  recordings,
  seconds,
  activeKey,
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
  seconds: Record<string, number>;
  activeKey: string | null;
  p1Count: number;
  p3Count: number;
  toggleRecording: (key: string) => void;
  deleteRecording: (key: string) => void;
  uploadRecordingFile: (key: string, file?: File) => void;
  publishedFeedback?: Feedback | null;
}) {
  return (
    <>
      <PartBlock title="Part 1" hint="Suggested length: 20-40 seconds per answer." progress={`${p1Count}/${assignment.p1_questions.length}`}>
        {items
          .filter((item) => item.part === "p1")
          .map((item, index) => (
            <RecorderCard
              key={item.key}
              number={index + 1}
              item={item}
              recording={recordings[item.key]}
              duration={recordings[item.key]?.duration ?? seconds[item.key] ?? 0}
              active={activeKey === item.key}
              onRecord={() => toggleRecording(item.key)}
              onDelete={() => deleteRecording(item.key)}
              onUpload={(file) => uploadRecordingFile(item.key, file)}
            />
          ))}
      </PartBlock>

      <PartBlock title="Part 2" hint="Prepare for 1 minute, then answer for about 1.5-2 minutes." progress={recordings.p2 ? "1/1" : "0/1"}>
        {items
          .filter((item) => item.part === "p2")
          .map((item) => (
            <RecorderCard
              key={item.key}
              item={item}
              recording={recordings[item.key]}
              duration={recordings[item.key]?.duration ?? seconds[item.key] ?? 0}
              active={activeKey === item.key}
              onRecord={() => toggleRecording(item.key)}
              onDelete={() => deleteRecording(item.key)}
              onUpload={(file) => uploadRecordingFile(item.key, file)}
            />
          ))}
      </PartBlock>

      <PartBlock title="Part 3" hint="Suggested length: 40-60 seconds per answer." progress={`${p3Count}/${assignment.p3_questions.length}`}>
        {items
          .filter((item) => item.part === "p3")
          .map((item, index) => (
            <RecorderCard
              key={item.key}
              number={index + 1}
              item={item}
              recording={recordings[item.key]}
              duration={recordings[item.key]?.duration ?? seconds[item.key] ?? 0}
              active={activeKey === item.key}
              onRecord={() => toggleRecording(item.key)}
              onDelete={() => deleteRecording(item.key)}
              onUpload={(file) => uploadRecordingFile(item.key, file)}
            />
          ))}
      </PartBlock>

      {publishedFeedback && <PublishedFeedback feedback={publishedFeedback} />}
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
  duration,
  active,
  onRecord,
  onDelete,
  onUpload
}: {
  number?: number;
  item: QuestionItem;
  recording?: LocalRecording;
  duration: number;
  active: boolean;
  onRecord: () => void;
  onDelete: () => void;
  onUpload: (file?: File) => void;
}) {
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
        <button className={`btn ${active ? "danger" : ""}`} onClick={onRecord} type="button">
          {active ? "Stop recording" : "Start recording"}
        </button>
        <button className="btn secondary" disabled={!recording} onClick={onDelete} type="button">
          Delete
        </button>
        <label className="file-upload">
          Upload audio
          <input accept="audio/*" type="file" onChange={(event) => onUpload(event.target.files?.[0])} />
        </label>
        {recording ? <audio controls src={recording.url} /> : <span className="hint">No recording yet</span>}
        <span className="timer">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function HistoryView({
  currentAssignmentId,
  submissions,
  assignments
}: {
  currentAssignmentId: string;
  submissions: Submission[];
  assignments: StudentAssignmentSummary[];
}) {
  const submittedAssignmentIds = new Set(submissions.map((submission) => submission.assignment_id));
  const currentFirst = assignments
    .slice()
    .sort((a, b) => (a.id === currentAssignmentId ? -1 : b.id === currentAssignmentId ? 1 : 0));

  return (
    <div className="stack">
      <article className="card stack">
        <div className="section-head">
          <div>
            <h2>{LABEL_AVAILABLE}</h2>
            <div className="hint">Homework assigned to this student, including unfinished work.</div>
          </div>
          <span className="pill">{assignments.length} active</span>
        </div>
        {currentFirst.length ? (
          currentFirst.map((item) => (
            <a className={`submission-row ${item.id === currentAssignmentId ? "active" : ""}`} href={`/s/${item.id}`} key={item.id}>
              <strong>{item.title}</strong>
              <span className="hint">{item.deadline_text}</span>
              <span className={`pill ${submittedAssignmentIds.has(item.id) ? "ok" : "warn"}`}>
                {submittedAssignmentIds.has(item.id) ? "Submitted" : "Not submitted"}
              </span>
            </a>
          ))
        ) : (
          <p className="hint">No active homework is available.</p>
        )}
      </article>

      <LearningProgressPanel submissions={submissions} />

      <article className="card stack">
        <div className="section-head">
          <div>
            <h2>{LABEL_HISTORY}</h2>
            <div className="hint">Open a homework title to view previous recordings and published feedback.</div>
          </div>
          <span className="pill">{submissions.length} submissions</span>
        </div>
        {submissions.length ? (
          submissions.map((submission) => (
            <HistoryCard key={submission.id} submission={submission} current={submission.assignment_id === currentAssignmentId} />
          ))
        ) : (
          <p className="hint">No submissions yet. Unfinished homework is listed above.</p>
        )}
      </article>
    </div>
  );
}

function HistoryCard({ submission, current }: { submission: Submission; current: boolean }) {
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  const title = submission.submission_title || assignment?.title || "Speaking homework";
  const feedback = Array.isArray(submission.feedback) ? submission.feedback[0] || null : submission.feedback || null;

  return (
    <details className="history-card">
      <summary>
        <div>
          <h3>{title}</h3>
          <div className="hint">{new Date(submission.submitted_at).toLocaleString("zh-CN")}</div>
        </div>
        <span className={`pill ${feedback?.published_at ? "ok" : current ? "warn" : ""}`}>
          {feedback?.published_at ? "Reviewed" : current ? "Current" : "Submitted"}
        </span>
      </summary>
      <div className="stack">
        {(submission.recordings || []).map((recording) => (
          <HistoryRecording key={recording.id} recording={recording} />
        ))}
      </div>
      {feedback?.published_at ? <PublishedFeedback feedback={feedback} compact /> : <p className="hint">Feedback has not been published yet.</p>}
    </details>
  );
}

function HistoryRecording({ recording }: { recording: Recording }) {
  return (
    <div className="history-recording">
      <div>
        <div className="hint">
          {recording.question_label} | {formatTime(recording.duration_seconds)}
        </div>
        <div className="question-title">{recording.question_text}</div>
      </div>
      {recording.signed_url ? <audio controls src={recording.signed_url} /> : <p className="hint">Recording link is unavailable.</p>}
    </div>
  );
}

function PublishedFeedback({ feedback, compact = false }: { feedback: Feedback; compact?: boolean }) {
  const scores = scoreDetails(feedback.details || []);
  const comments = questionCommentDetails(feedback.details || []);
  return (
    <article className={`${compact ? "feedback-compact" : "card"} stack`}>
      <div className="section-head">
        <div>
          <h2>Teacher feedback</h2>
          <div className="hint">Published feedback for this submission.</div>
        </div>
        <span className="pill ok">Reviewed</span>
      </div>
      <div className="overall">
        <div className="overall-score">
          <span>Average score</span>
          <strong>{(feedback.overall_score || averageScore(scores)).toFixed(1)}</strong>
        </div>
        <p>{feedback.overall_comment}</p>
      </div>
      <div className="stack">
        <label>Scores</label>
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
        <label>Question comments</label>
        {comments.map((detail: FeedbackDetail) => (
          <article className="detail-item" key={detail.part}>
            <div>
              <div className="hint">{detail.label}</div>
              <div className="question-title">{detail.question}</div>
            </div>
            <p className="hint">{detail.comment || "No comment yet."}</p>
          </article>
        ))}
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

function formatTime(total: number) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
