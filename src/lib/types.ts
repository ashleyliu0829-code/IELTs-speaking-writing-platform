export type Assignment = {
  id: string;
  title: string;
  deadline_text: string;
  p1_questions: string[];
  p2_prompt: string;
  p3_questions: string[];
  training_note: string;
  assigned_students: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type QuestionItem = {
  key: string;
  part: "p1" | "p2" | "p3";
  label: string;
  question: string;
};

export type Recording = {
  id: string;
  submission_id: string;
  question_key: string;
  question_label: string;
  question_text: string;
  transcript_text: string;
  storage_path: string;
  duration_seconds: number;
  signed_url?: string;
};

export type SubmissionAssignment = {
  id: string;
  title: string;
  deadline_text: string;
};

export type FeedbackDetail = {
  part: string;
  label: string;
  question: string;
  score: number;
  comment: string;
};

export type Feedback = {
  id?: string;
  submission_id: string;
  overall_score: number;
  overall_comment: string;
  transcript: string;
  details: FeedbackDetail[];
  published_at?: string | null;
};

export type Submission = {
  id: string;
  assignment_id: string;
  student_name: string;
  submission_title?: string;
  submitted_at: string;
  assignments?: SubmissionAssignment | SubmissionAssignment[] | null;
  recordings?: Recording[];
  feedback?: Feedback | Feedback[] | null;
};
