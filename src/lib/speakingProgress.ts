import { p1QuestionBank, p2P3QuestionBank } from "@/lib/questionBank";
import type { Assignment, Submission, SubmissionAssignment } from "@/lib/types";

export type SpeakingTopicProgress = {
  p1Completed: Set<string>;
  p2Completed: Set<string>;
  p1Total: number;
  p2Total: number;
};

export function getSpeakingTopicProgress(submissions: Submission[]): SpeakingTopicProgress {
  const p1Completed = new Set<string>();
  const p2Completed = new Set<string>();

  submissions.forEach((submission) => {
    const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
    const isSpeaking = (assignment?.assignment_type || "speaking") === "speaking";
    if (!isSpeaking) return;

    const recordings = submission.recordings || [];
    const completedP1Recordings = recordings.filter((recording) => recording.question_key?.startsWith("p1"));
    const completedP2Recordings = recordings.filter((recording) => recording.question_key === "p2");

    completedP1Recordings.forEach((recording) => {
      const matched = findP1TopicByQuestion(recording.question_text);
      if (matched) p1Completed.add(matched.id);
    });

    if (completedP1Recordings.length && assignment?.p1_questions?.length) {
      assignment.p1_questions.forEach((question) => {
        const matched = findP1TopicByQuestion(question);
        if (matched) p1Completed.add(matched.id);
      });
    }

    completedP2Recordings.forEach((recording) => {
      const matched = findP2TopicByPrompt(assignment?.p2_prompt || recording.question_text);
      if (matched) p2Completed.add(matched.id);
    });
  });

  return {
    p1Completed,
    p2Completed,
    p1Total: p1QuestionBank.length,
    p2Total: p2P3QuestionBank.length
  };
}

export function getSpeakingTopicIdsFromAssignments(assignments: Array<Pick<Assignment, "assignment_type" | "p1_questions" | "p2_prompt"> | SubmissionAssignment>) {
  const p1TopicIds = new Set<string>();
  const p2TopicIds = new Set<string>();

  assignments.forEach((assignment) => {
    if ((assignment.assignment_type || "speaking") !== "speaking") return;
    (assignment.p1_questions || []).forEach((question) => {
      const matched = findP1TopicByQuestion(question);
      if (matched) p1TopicIds.add(matched.id);
    });
    const p2Match = findP2TopicByPrompt(assignment.p2_prompt || "");
    if (p2Match) p2TopicIds.add(p2Match.id);
  });

  return {
    p1: [...p1TopicIds],
    p2: [...p2TopicIds]
  };
}

function findP1TopicByQuestion(questionText: string) {
  const normalized = normalizeQuestion(questionText);
  return p1QuestionBank.find((set) => set.questions.some((question) => normalizeQuestion(question) === normalized));
}

function findP2TopicByPrompt(prompt: string) {
  const normalized = normalizeP2Title(prompt);
  return p2P3QuestionBank.find((set) => normalizeP2Title(set.p2Prompt) === normalized || normalizeP2Title(set.topic) === normalized);
}

function normalizeP2Title(value: string) {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) || value;
  return firstLine
    .replace(/^describe\s+/i, "describe ")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeQuestion(value: string) {
  return value
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
