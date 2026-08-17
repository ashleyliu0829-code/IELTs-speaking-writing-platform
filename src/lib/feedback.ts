import type { FeedbackDetail, Recording, Submission, WritingResponse } from "@/lib/types";

export const scoreParts = ["fluency", "task_response", "coherence", "grammar", "vocabulary"] as const;

export function isScoreDetail(detail: FeedbackDetail) {
  return scoreParts.includes(detail.part as (typeof scoreParts)[number]);
}

export function scoreDetails(details: FeedbackDetail[] = []) {
  return details.filter(isScoreDetail).map(localizeScoreDetail);
}

export function questionCommentDetails(details: FeedbackDetail[] = []) {
  return details.filter((detail) => detail.part.startsWith("comment:"));
}

function localizeScoreDetail(detail: FeedbackDetail): FeedbackDetail {
  const labels: Record<string, { label: string; question: string }> = {
    fluency: { label: "流利度", question: "整体流利度评分" },
    task_response: { label: "任务回应", question: "整体任务回应评分" },
    coherence: { label: "连贯与衔接", question: "整体连贯与衔接评分" },
    grammar: { label: "语法", question: "整体语法评分" },
    vocabulary: { label: "词汇", question: "整体词汇评分" }
  };
  const localized = labels[detail.part];
  return localized ? { ...detail, ...localized } : detail;
}

export function defaultScoreDetails(): FeedbackDetail[] {
  return [
    {
      part: "fluency",
      label: "流利度",
      question: "整体流利度评分",
      score: 0,
      comment: ""
    },
    {
      part: "grammar",
      label: "语法",
      question: "整体语法评分",
      score: 0,
      comment: ""
    },
    {
      part: "vocabulary",
      label: "词汇",
      question: "整体词汇评分",
      score: 0,
      comment: ""
    }
  ];
}

export function defaultWritingScoreDetails(): FeedbackDetail[] {
  return [
    {
      part: "task_response",
      label: "任务回应",
      question: "整体任务回应评分",
      score: 0,
      comment: ""
    },
    {
      part: "coherence",
      label: "连贯与衔接",
      question: "整体连贯与衔接评分",
      score: 0,
      comment: ""
    },
    {
      part: "grammar",
      label: "语法",
      question: "整体语法评分",
      score: 0,
      comment: ""
    },
    {
      part: "vocabulary",
      label: "词汇",
      question: "整体词汇评分",
      score: 0,
      comment: ""
    }
  ];
}

export function defaultQuestionComments(submission: Submission): FeedbackDetail[] {
  const recordingComments = (submission.recordings || []).map((recording: Recording) => ({
    part: `comment:${recording.question_key}`,
    label: recording.question_label,
    question: recording.question_text,
    score: 0,
    comment: ""
  }));

  const writingComments = (submission.writing_responses || []).map((response: WritingResponse) => ({
    part: `comment:${response.task_key}`,
    label: response.task_label,
    question: response.task_title || response.task_prompt,
    score: 0,
    comment: ""
  }));

  return [...recordingComments, ...writingComments];
}

export function mergeFeedbackDetails(existing: FeedbackDetail[] = [], submission: Submission) {
  const existingScores = scoreDetails(existing);
  const existingComments = questionCommentDetails(existing);
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  const isWriting = assignment?.assignment_type === "writing" || Boolean(submission.writing_responses?.length);

  const scores = (isWriting ? defaultWritingScoreDetails() : defaultScoreDetails()).map((fallback) => {
    const found = existingScores.find((detail) => detail.part === fallback.part);
    return found ? { ...fallback, ...found, comment: "" } : fallback;
  });

  const comments = defaultQuestionComments(submission).map((fallback) => {
    const found = existingComments.find((detail) => detail.part === fallback.part);
    return found ? { ...fallback, comment: found.comment || "" } : fallback;
  });

  return [...scores, ...comments];
}
