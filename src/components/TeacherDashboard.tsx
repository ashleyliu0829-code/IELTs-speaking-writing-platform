"use client";

import { useMemo, useState } from "react";
import type { Assignment, Feedback, FeedbackDetail, Recording, Submission } from "@/lib/types";
import { mergeFeedbackDetails, questionCommentDetails, scoreDetails } from "@/lib/feedback";
import { p1QuestionBank, p2P3QuestionBank } from "@/lib/questionBank";
import { averageScore, defaultAssignment } from "@/lib/questions";
import { LearningProgressPanel } from "@/components/LearningProgress";

type DraftAssignment = Omit<Assignment, "created_at" | "updated_at">;

export function TeacherDashboard() {
  const [token, setToken] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<DraftAssignment>(() => ({ id: "", ...defaultAssignment }));
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState<Feedback | null>(null);
  const [studentProgress, setStudentProgress] = useState<Submission[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId);
  const studentLink = useMemo(() => {
    if (!draft.id || typeof window === "undefined") return "";
    return `${window.location.origin}/s/${draft.id}`;
  }, [draft.id]);

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function loadAssignments() {
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/teacher/assignments");
      const loaded = data.assignments || [];
      setAssignments(loaded);
      if (loaded[0]) {
        setSelectedId(loaded[0].id);
        setDraft(loaded[0]);
        await loadSubmissions(loaded[0].id);
      } else {
        startNewAssignment();
      }
      setMessage("Dashboard loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSubmissions(assignmentId = selectedId) {
    if (!assignmentId) return;
    const data = await api(`/api/teacher/submissions?assignmentId=${assignmentId}`);
    const loaded = data.submissions || [];
    const first = loaded[0];
    setSubmissions(loaded);
    setSelectedSubmissionId(first?.id || "");
    setFeedbackDraft(first ? feedbackForSubmission(first) : null);
    if (first?.student_name) {
      await loadStudentProgress(first.student_name);
    } else {
      setStudentProgress([]);
    }
  }

  async function loadStudentProgress(studentName: string) {
    const data = await api(`/api/teacher/submissions?studentName=${encodeURIComponent(studentName)}`);
    setStudentProgress(data.submissions || []);
  }

  function selectAssignment(id: string) {
    const assignment = assignments.find((item) => item.id === id);
    setSelectedId(id);
    if (assignment) {
      setDraft(assignment);
      void loadSubmissions(id);
      setStudentProgress([]);
    }
  }

  function startNewAssignment() {
    setSelectedId("");
    setDraft({ id: "", ...defaultAssignment });
    setSubmissions([]);
    setSelectedSubmissionId("");
    setFeedbackDraft(null);
    setStudentProgress([]);
  }

  async function saveAssignment(asNew = false) {
    setMessage("");
    try {
      const payload = {
        ...draft,
        p1_questions: draft.p1_questions.map((question) => question.trim()).filter(Boolean),
        p3_questions: draft.p3_questions.map((question) => question.trim()).filter(Boolean),
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
      setMessage(asNew ? "New homework saved." : "Assignment saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
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
      setMessage("AI draft feedback generated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI analysis failed.");
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
      await loadSubmissions();
      if (selectedSubmission?.student_name) await loadStudentProgress(selectedSubmission.student_name);
      setMessage("Feedback published.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish failed.");
    }
  }

  async function deleteSubmission() {
    if (!selectedSubmission) return;
    const confirmed = window.confirm(`Delete ${selectedSubmission.student_name}'s submission and all recordings?`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      await api(`/api/teacher/submissions?submissionId=${selectedSubmission.id}`, {
        method: "DELETE"
      });
      await loadSubmissions();
      setMessage("Submission deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setLoading(false);
    }
  }

  function selectSubmission(id: string) {
    const submission = submissions.find((item) => item.id === id);
    setSelectedSubmissionId(id);
    setFeedbackDraft(submission ? feedbackForSubmission(submission) : null);
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

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>Teacher dashboard</h1>
          <p>Edit homework, copy the student link, review recordings, generate AI draft feedback, and publish final feedback.</p>
        </div>
        <aside className="panel stack">
          <div>
            <label>Teacher access token</label>
            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="TEACHER_ACCESS_TOKEN" />
          </div>
          <button className="btn" onClick={loadAssignments} disabled={!token || loading} type="button">
            {loading ? "Loading..." : "Enter dashboard"}
          </button>
          {message && <p className={message.includes("failed") || message.includes("Unauthorized") ? "error" : "hint"}>{message}</p>}
        </aside>
      </section>

      <section className="grid">
        <aside className="panel stack">
          <div className="section-head">
            <h2>Homework settings</h2>
            <button className="btn secondary" type="button" onClick={startNewAssignment}>
              New
            </button>
          </div>
          <AssignmentPicker value={selectedId} assignments={assignments} onChange={selectAssignment} />
          <AssignmentEditor draft={draft} setDraft={setDraft} />
          <div className="bank-actions">
            <button className="btn" onClick={() => saveAssignment(false)} disabled={!token} type="button">
              Save homework
            </button>
            <button className="btn secondary" onClick={() => saveAssignment(true)} disabled={!token} type="button">
              Save as new homework
            </button>
          </div>
          {studentLink && (
            <div className="question-card">
              <label>Student link</label>
              <input value={studentLink} readOnly />
              <button className="btn secondary" onClick={() => navigator.clipboard.writeText(studentLink)} type="button">
                Copy link
              </button>
            </div>
          )}
        </aside>

        <div className="stack">
          <article className="card stack">
            <div className="section-head">
              <div>
                <h2>Submissions</h2>
                <div className="hint">Choose one submission to review.</div>
              </div>
              <button className="btn secondary" onClick={() => loadSubmissions()} disabled={!selectedId} type="button">
                Refresh
              </button>
            </div>
            {submissions.length === 0 ? (
              <p className="hint">No submissions yet.</p>
            ) : (
              submissions.map((submission) => (
                <button
                  className={`submission-row ${submission.id === selectedSubmissionId ? "active" : ""}`}
                  key={submission.id}
                  onClick={() => selectSubmission(submission.id)}
                  type="button"
                >
                  <strong>{submission.student_name}</strong>
                  <span>{submission.submission_title || submissionTitle(submission)}</span>
                  <span className="hint">{new Date(submission.submitted_at).toLocaleString("zh-CN")}</span>
                  <span className={`pill ${submission.feedback && !Array.isArray(submission.feedback) && submission.feedback.published_at ? "ok" : "warn"}`}>
                    {submission.feedback && !Array.isArray(submission.feedback) && submission.feedback.published_at
                      ? "Published"
                      : submission.feedback
                        ? "Draft"
                        : "Not analyzed"}
                  </span>
                </button>
              ))
            )}
          </article>

          {selectedSubmission && (
            <article className="card stack">
              <div className="section-head">
                <div>
                  <h2>{selectedSubmission.student_name}</h2>
                  <div className="hint">{selectedSubmission.submission_title || submissionTitle(selectedSubmission)}</div>
                </div>
                <div className="stack">
                  <span className={`pill ${feedbackDraft?.published_at ? "ok" : "warn"}`}>
                    {feedbackDraft?.published_at ? "Published" : feedbackDraft ? "Draft" : "Pending"}
                  </span>
                  <button className="btn danger" onClick={deleteSubmission} disabled={loading} type="button">
                    Delete submission
                  </button>
                </div>
              </div>
              <RecordingList
                recordings={selectedSubmission.recordings || []}
                feedback={feedbackDraft || createManualFeedback(selectedSubmission)}
                updateDetail={updateDetail}
              />
              <LearningProgressPanel submissions={studentProgress} />
              <button className="btn secondary" onClick={analyzeSubmission} disabled={loading} type="button">
                {loading ? "Generating..." : "Generate AI draft feedback"}
              </button>
              <FeedbackEditor
                feedback={feedbackDraft || createManualFeedback(selectedSubmission)}
                updateComment={(overall_comment) => setFeedbackDraft({ ...(feedbackDraft || createManualFeedback(selectedSubmission)), overall_comment })}
                updateDetail={updateDetail}
                publish={publishFeedback}
              />
            </article>
          )}
        </div>
      </section>
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
  return assignment?.title || "Speaking homework";
}

function AssignmentPicker({
  value,
  assignments,
  onChange
}: {
  value: string;
  assignments: Assignment[];
  onChange: (id: string) => void;
}) {
  if (!assignments.length) return <p className="hint">No saved homework yet.</p>;

  return (
    <div className="stack">
      {assignments.map((assignment) => (
        <button
          className={`submission-row ${assignment.id === value ? "active" : ""}`}
          key={assignment.id}
          onClick={() => onChange(assignment.id)}
          type="button"
        >
          <strong>{assignment.title}</strong>
          <span className="hint">{assignment.deadline_text}</span>
        </button>
      ))}
    </div>
  );
}

function AssignmentEditor({
  draft,
  setDraft
}: {
  draft: DraftAssignment;
  setDraft: (draft: DraftAssignment) => void;
}) {
  const [selectedP1SetId, setSelectedP1SetId] = useState(p1QuestionBank[0]?.id || "");
  const [selectedP2P3SetId, setSelectedP2P3SetId] = useState(p2P3QuestionBank[0]?.id || "");

  const selectedP1Set = p1QuestionBank.find((set) => set.id === selectedP1SetId) || p1QuestionBank[0];
  const selectedP2P3Set = p2P3QuestionBank.find((set) => set.id === selectedP2P3SetId) || p2P3QuestionBank[0];

  function addP1Set() {
    if (!selectedP1Set) return;
    setDraft({
      ...draft,
      p1_questions: appendUniqueQuestions(draft.p1_questions, selectedP1Set.questions)
    });
  }

  function replaceP1Set() {
    if (!selectedP1Set) return;
    setDraft({ ...draft, p1_questions: selectedP1Set.questions });
  }

  function applyP2P3Set() {
    if (!selectedP2P3Set) return;
    setDraft({
      ...draft,
      p2_prompt: selectedP2P3Set.p2Prompt,
      p3_questions: selectedP2P3Set.p3Questions
    });
  }

  return (
    <div className="stack">
      <div>
        <label>Homework title</label>
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </div>
      <div>
        <label>Deadline</label>
        <input value={draft.deadline_text} onChange={(event) => setDraft({ ...draft, deadline_text: event.target.value })} />
      </div>
      <div>
        <label>Training note</label>
        <textarea value={draft.training_note} onChange={(event) => setDraft({ ...draft, training_note: event.target.value })} />
      </div>
      <div>
        <label>Assigned students</label>
        <textarea
          value={(draft.assigned_students || []).join("\n")}
          placeholder="Leave blank for all students. Put one student name per line."
          onChange={(event) => setDraft({ ...draft, assigned_students: parseStudentNames(event.target.value) })}
        />
        <p className="hint">Only these students will see this homework after entering their name. Leave blank to make it visible to everyone.</p>
      </div>
      <div className="bank-panel">
        <div>
          <label>Part 1 question bank</label>
          <select value={selectedP1SetId} onChange={(event) => setSelectedP1SetId(event.target.value)}>
            {p1QuestionBank.map((set) => (
              <option key={set.id} value={set.id}>
                {set.topic}
              </option>
            ))}
          </select>
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
            Add to Part 1
          </button>
          <button className="btn secondary" type="button" onClick={replaceP1Set}>
            Replace Part 1
          </button>
        </div>
      </div>
      <QuestionInputs title="Part 1 questions" values={draft.p1_questions} onChange={(p1_questions) => setDraft({ ...draft, p1_questions })} />
      <div className="bank-panel">
        <div>
          <label>Part 2 & 3 question bank</label>
          <select value={selectedP2P3SetId} onChange={(event) => setSelectedP2P3SetId(event.target.value)}>
            {p2P3QuestionBank.map((set) => (
              <option key={set.id} value={set.id}>
                {set.topic}
              </option>
            ))}
          </select>
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
          Apply to Part 2 & 3
        </button>
      </div>
      <div>
        <label>Part 2 cue card</label>
        <textarea value={draft.p2_prompt} onChange={(event) => setDraft({ ...draft, p2_prompt: event.target.value })} />
      </div>
      <QuestionInputs title="Part 3 questions" values={draft.p3_questions} onChange={(p3_questions) => setDraft({ ...draft, p3_questions })} />
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
    .split(/[\n,，;；]+/)
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
            Delete
          </button>
        </div>
      ))}
      <button className="btn ghost" type="button" onClick={() => onChange([...values, ""])}>
        Add question
      </button>
    </div>
  );
}

function RecordingList({
  recordings,
  feedback,
  updateDetail
}: {
  recordings: Recording[];
  feedback: Feedback;
  updateDetail: (index: number, patch: Partial<FeedbackDetail>) => void;
}) {
  const comments = questionCommentDetails(feedback.details || []);

  return (
    <div className="stack">
      <label>Recordings</label>
      {recordings.map((recording) => {
        const comment = comments.find((detail) => detail.part === `comment:${recording.question_key}`);
        const commentIndex = feedback.details.findIndex((detail) => detail.part === comment?.part);

        return (
          <article className="question-card" key={recording.id}>
            <div>
              <div className="hint">
                {recording.question_label} | {formatTime(recording.duration_seconds)}
              </div>
              <div className="question-title">{recording.question_text}</div>
            </div>
            {recording.signed_url ? <audio controls src={recording.signed_url} /> : <p className="hint">Recording link is unavailable.</p>}
            {comment && (
              <div className="inline-comment">
                <label>Comment for this question</label>
                <textarea
                  value={comment.comment}
                  onChange={(event) => updateDetail(commentIndex, { comment: event.target.value })}
                />
              </div>
            )}
          </article>
        );
      })}
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
          <span>Average score</span>
          <strong>{average.toFixed(1)}</strong>
        </div>
        <label>General Comment</label>
        <textarea value={feedback.overall_comment} onChange={(event) => updateComment(event.target.value)} />
      </div>
      <div className="stack">
        <label>Score Area: Fluency, Grammar, Vocabulary</label>
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
        Publish feedback
      </button>
    </div>
  );
}

function formatTime(total: number) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
