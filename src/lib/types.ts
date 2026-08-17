export type AssignmentType = "speaking" | "writing";

export type WritingTask = {
  key: string;
  label: string;
  title: string;
  prompt: string;
  word_limit: string;
  task1_type?: string;
  task2_type?: string;
  topic?: string;
  image_urls?: string[];
};

export type Assignment = {
  id: string;
  teacher_id?: string | null;
  assignment_type: AssignmentType;
  title: string;
  deadline_text: string;
  due_date?: string | null;
  p1_questions: string[];
  p2_prompt: string;
  p3_questions: string[];
  writing_tasks: WritingTask[];
  training_note: string;
  assigned_students: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type StudentProfile = {
  id: string;
  teacher_id?: string | null;
  name: string;
  normalized_name: string;
  phone?: string | null;
  account_id?: string | null;
  first_seen_at?: string;
  last_seen_at?: string;
  submission_count?: number;
  reviewed_count?: number;
  latest_submission_at?: string | null;
  latest_score?: number | null;
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
  corrected_transcript_text: string;
  storage_path: string;
  duration_seconds: number;
  signed_url?: string;
  teacher_demo?: TeacherDemoRecording | null;
};

export type SpeakingPracticeType = "p1" | "p2p3";

export type SpeakingPracticeRecording = {
  id: string;
  practice_submission_id: string;
  question_key: string;
  question_label: string;
  question_text: string;
  storage_path: string;
  duration_seconds: number;
  teacher_comment?: string | null;
  signed_url?: string;
  created_at?: string;
  updated_at?: string;
};

export type SpeakingPracticeSubmission = {
  id: string;
  teacher_id?: string | null;
  student_account_id?: string | null;
  student_name: string;
  practice_type: SpeakingPracticeType;
  topic_id: string;
  topic_title: string;
  p1_questions: string[];
  p2_prompt: string;
  p3_questions: string[];
  status: "in_progress" | "submitted" | "reviewed";
  teacher_comment?: string | null;
  fluency_score?: number | null;
  grammar_score?: number | null;
  vocabulary_score?: number | null;
  submitted_at?: string;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  recordings?: SpeakingPracticeRecording[];
};

export type TeacherDemoRecording = {
  id: string;
  recording_id: string;
  storage_path: string;
  duration_seconds: number;
  signed_url?: string;
  created_at?: string;
  updated_at?: string;
};

export type WritingResponse = {
  id: string;
  submission_id: string;
  task_key: string;
  task_label: string;
  task_title: string;
  task_prompt: string;
  response_text: string;
  teacher_revision_text: string;
  created_at?: string;
  updated_at?: string;
};

export type SubmissionAssignment = {
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
  teacher_id?: string | null;
  assignment_id: string;
  student_name: string;
  submission_title?: string;
  submission_status?: "in_progress" | "submitted" | "reviewed";
  submitted_at: string;
  assignments?: SubmissionAssignment | SubmissionAssignment[] | null;
  recordings?: Recording[];
  writing_responses?: WritingResponse[];
  feedback?: Feedback | Feedback[] | null;
};

export type LessonSlot = {
  id: string;
  teacher_id?: string | null;
  lesson_type?: "regular" | "practice";
  start_at: string;
  end_at: string;
  timezone: string;
  note?: string | null;
  is_active: boolean;
  created_at?: string;
  bookings?: LessonBooking[];
};

export type LessonBooking = {
  id: string;
  slot_id: string;
  student_account_id?: string | null;
  student_name: string;
  course_minutes: number;
  reserved_minutes: number;
  start_at: string;
  end_at: string;
  status: "pending" | "confirmed" | "cancelled" | "booked";
  student_timezone?: string | null;
  cancelled_by?: "teacher" | "student" | null;
  cancelled_at?: string | null;
  teacher_suggested_time?: string | null;
  created_at?: string;
};

export type LessonRecord = {
  id: string;
  student_name: string;
  lesson_at: string;
  sections: Array<"Speaking" | "Listening" | "Reading" | "Writing">;
  duration_minutes: number;
  pre_homework_assignment_ids: string[];
  post_homework_assignment_ids: string[];
  preparation_note: string;
  homework_note: string;
  created_at?: string;
  updated_at?: string;
  pre_homework?: Assignment[];
  post_homework?: Assignment[];
};

export type DailyTask = {
  id: string;
  teacher_id?: string | null;
  title: string;
  description: string;
  task_type: string;
  assigned_students: string[];
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  checkins?: DailyTaskCheckin[];
};

export type DailyTaskCheckin = {
  id: string;
  task_id: string;
  student_name: string;
  checkin_date: string;
  checked_at?: string;
};
