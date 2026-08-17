create extension if not exists "pgcrypto";

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_type text not null default 'speaking',
  title text not null,
  deadline_text text not null,
  due_date date,
  p1_questions jsonb not null default '[]'::jsonb,
  p2_prompt text not null,
  p3_questions jsonb not null default '[]'::jsonb,
  writing_tasks jsonb not null default '[]'::jsonb,
  training_note text not null default '',
  assigned_students jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('teacher', 'student')),
  phone text not null unique,
  display_name text not null,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  phone text,
  account_id uuid references accounts(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_name text not null,
  submission_title text not null default '',
  submitted_at timestamptz not null default now()
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_key text not null,
  question_label text not null,
  question_text text not null,
  transcript_text text not null default '',
  corrected_transcript_text text not null default '',
  storage_path text not null,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists teacher_demo_recordings (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references recordings(id) on delete cascade,
  storage_path text not null,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists writing_responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  task_key text not null,
  task_label text not null,
  task_title text not null,
  task_prompt text not null,
  response_text text not null default '',
  teacher_revision_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id, task_key)
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  overall_score numeric(3, 1) not null default 0,
  overall_comment text not null default '',
  transcript text not null default '',
  details jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lesson_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references accounts(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'Asia/Shanghai',
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists lesson_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references lesson_slots(id) on delete cascade,
  student_account_id uuid references accounts(id) on delete set null,
  student_name text not null,
  course_minutes integer not null check (course_minutes in (60, 120)),
  reserved_minutes integer not null check (reserved_minutes in (90, 150)),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  student_timezone text not null default 'Asia/Shanghai',
  cancelled_by text check (cancelled_by is null or cancelled_by in ('teacher', 'student')),
  cancelled_at timestamptz,
  teacher_suggested_time text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists daily_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  task_type text not null default 'general',
  assigned_students jsonb not null default '[]'::jsonb,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists daily_task_checkins (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references daily_tasks(id) on delete cascade,
  student_name text not null,
  checkin_date date not null,
  checked_at timestamptz not null default now(),
  unique(task_id, student_name, checkin_date)
);

create table if not exists lesson_records (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  lesson_at timestamptz not null,
  sections jsonb not null default '[]'::jsonb,
  duration_minutes integer not null,
  pre_homework_assignment_ids jsonb not null default '[]'::jsonb,
  post_homework_assignment_ids jsonb not null default '[]'::jsonb,
  preparation_note text not null default '',
  homework_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duration_minutes > 0)
);

create index if not exists assignments_created_at_idx on assignments(created_at desc);
create index if not exists accounts_role_idx on accounts(role);
create index if not exists account_sessions_account_id_idx on account_sessions(account_id);
create index if not exists account_sessions_expires_at_idx on account_sessions(expires_at);
create index if not exists students_last_seen_at_idx on students(last_seen_at desc);
create index if not exists submissions_assignment_id_idx on submissions(assignment_id);
create index if not exists recordings_submission_id_idx on recordings(submission_id);
create index if not exists teacher_demo_recordings_recording_id_idx on teacher_demo_recordings(recording_id);
create index if not exists writing_responses_submission_id_idx on writing_responses(submission_id);
create index if not exists lesson_slots_start_at_idx on lesson_slots(start_at);
create index if not exists lesson_slots_active_idx on lesson_slots(is_active, start_at);
create index if not exists lesson_bookings_slot_id_idx on lesson_bookings(slot_id);
create index if not exists lesson_bookings_student_account_id_idx on lesson_bookings(student_account_id);
create index if not exists lesson_bookings_status_start_at_idx on lesson_bookings(status, start_at);
create index if not exists daily_tasks_active_dates_idx on daily_tasks(is_active, start_date, end_date);
create index if not exists daily_task_checkins_task_id_idx on daily_task_checkins(task_id);
create index if not exists daily_task_checkins_student_date_idx on daily_task_checkins(student_name, checkin_date desc);
create index if not exists lesson_records_student_lesson_at_idx on lesson_records(student_name, lesson_at desc);
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists assignments_set_updated_at on assignments;
create trigger assignments_set_updated_at
before update on assignments
for each row execute function set_updated_at();

drop trigger if exists feedback_set_updated_at on feedback;
create trigger feedback_set_updated_at
before update on feedback
for each row execute function set_updated_at();

drop trigger if exists writing_responses_set_updated_at on writing_responses;
create trigger writing_responses_set_updated_at
before update on writing_responses
for each row execute function set_updated_at();

drop trigger if exists teacher_demo_recordings_set_updated_at on teacher_demo_recordings;
create trigger teacher_demo_recordings_set_updated_at
before update on teacher_demo_recordings
for each row execute function set_updated_at();

drop trigger if exists lesson_slots_set_updated_at on lesson_slots;
create trigger lesson_slots_set_updated_at
before update on lesson_slots
for each row execute function set_updated_at();

drop trigger if exists lesson_bookings_set_updated_at on lesson_bookings;
create trigger lesson_bookings_set_updated_at
before update on lesson_bookings
for each row execute function set_updated_at();

drop trigger if exists daily_tasks_set_updated_at on daily_tasks;
create trigger daily_tasks_set_updated_at
before update on daily_tasks
for each row execute function set_updated_at();

drop trigger if exists lesson_records_set_updated_at on lesson_records;
create trigger lesson_records_set_updated_at
before update on lesson_records
for each row execute function set_updated_at();
