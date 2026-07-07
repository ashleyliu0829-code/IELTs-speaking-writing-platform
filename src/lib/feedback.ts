import type { FeedbackDetail, Recording, Submission } from "@/lib/types";

export const scoreParts = ["fluency", "grammar", "vocabulary"] as const;

export function isScoreDetail(detail: FeedbackDetail) {
  return scoreParts.includes(detail.part as (typeof scoreParts)[number]);
}

export function scoreDetails(details: FeedbackDetail[] = []) {
  return details.filter(isScoreDetail);
}

export function questionCommentDetails(details: FeedbackDetail[] = []) {
  return details.filter((detail) => detail.part.startsWith("comment:"));
}

export function defaultScoreDetails(): FeedbackDetail[] {
  return [
    {
      part: "fluency",
      label: "Fluency",
      question: "Overall fluency score",
      score: 0,
      comment: ""
    },
    {
      part: "grammar",
      label: "Grammar",
      question: "Overall grammar score",
      score: 0,
      comment: ""
    },
    {
      part: "vocabulary",
      label: "Vocabulary",
      question: "Overall vocabulary score",
      score: 0,
      comment: ""
    }
  ];
}

export function defaultQuestionComments(submission: Submission): FeedbackDetail[] {
  return (submission.recordings || []).map((recording: Recording) => ({
    part: `comment:${recording.question_key}`,
    label: recording.question_label,
    question: recording.question_text,
    score: 0,
    comment: ""
  }));
}

export function mergeFeedbackDetails(existing: FeedbackDetail[] = [], submission: Submission) {
  const existingScores = scoreDetails(existing);
  const existingComments = questionCommentDetails(existing);

  const scores = defaultScoreDetails().map((fallback) => {
    const found = existingScores.find((detail) => detail.part === fallback.part);
    return found ? { ...fallback, ...found, comment: "" } : fallback;
  });

  const comments = defaultQuestionComments(submission).map((fallback) => {
    const found = existingComments.find((detail) => detail.part === fallback.part);
    return found ? { ...fallback, comment: found.comment || "" } : fallback;
  });

  return [...scores, ...comments];
}
