create table if not exists speaking_practice_submissions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references accounts(id) on delete set null,
  student_account_id uuid references accounts(id) on delete set null,
  student_name text not null,
  practice_type text not null check (practice_type in ('p1', 'p2p3')),
  topic_id text not null,
  topic_title text not null,
  p1_questions jsonb not null default '[]'::jsonb,
  p2_prompt text not null default '',
  p3_questions jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'reviewed')),
  teacher_comment text not null default '',
  fluency_score numeric,
  grammar_score numeric,
  vocabulary_score numeric,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists speaking_practice_recordings (
  id uuid primary key default gen_random_uuid(),
  practice_submission_id uuid not null references speaking_practice_submissions(id) on delete cascade,
  question_key text not null,
  question_label text not null,
  question_text text not null,
  storage_path text not null,
  duration_seconds integer not null default 0,
  teacher_comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists speaking_practice_unique_student_topic_idx
on speaking_practice_submissions(teacher_id, student_account_id, practice_type, topic_id);

create unique index if not exists speaking_practice_recording_question_idx
on speaking_practice_recordings(practice_submission_id, question_key);

create index if not exists speaking_practice_teacher_student_idx
on speaking_practice_submissions(teacher_id, student_name, submitted_at desc);
