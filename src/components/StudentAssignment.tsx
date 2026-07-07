"use client";

import { useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Assignment, Feedback, FeedbackDetail, QuestionItem } from "@/lib/types";
import { questionCommentDetails, scoreDetails } from "@/lib/feedback";
import { averageScore, getQuestionItems } from "@/lib/questions";

type LocalRecording = {
  blob: Blob;
  url: string;
  duration: number;
};

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
      const recorder = new MediaRecorder(stream);
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

      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
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

      recorder.start();
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
      formData.append(`audio_${item.key}`, recording.blob, `${item.key}.webm`);
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
      setMessage(data.error || "Submission failed. Please try again.");
      return;
    }

    const data = await response.json();
    if (data.submissionId) {
      window.history.replaceState(null, "", `/s/${assignment.id}?submissionId=${data.submissionId}`);
    }
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
          <h2>Submission</h2>
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
                />
              ))}
          </PartBlock>

          {publishedFeedback && <PublishedFeedback feedback={publishedFeedback} />}
        </div>
      </section>
    </main>
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
  onDelete
}: {
  number?: number;
  item: QuestionItem;
  recording?: LocalRecording;
  duration: number;
  active: boolean;
  onRecord: () => void;
  onDelete: () => void;
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
        {recording ? <audio controls src={recording.url} /> : <span className="hint">No recording yet</span>}
        <span className="timer">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function PublishedFeedback({ feedback }: { feedback: Feedback }) {
  const scores = scoreDetails(feedback.details || []);
  const comments = questionCommentDetails(feedback.details || []);
  return (
    <article className="card stack">
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

function formatTime(total: number) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
