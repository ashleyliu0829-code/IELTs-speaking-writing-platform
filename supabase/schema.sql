create extension if not exists "pgcrypto";

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  deadline_text text not null,
  p1_questions jsonb not null default '[]'::jsonb,
  p2_prompt text not null,
  p3_questions jsonb not null default '[]'::jsonb,
  training_note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_name text not null,
  submitted_at timestamptz not null default now()
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_key text not null,
  question_label text not null,
  question_text text not null,
  transcript_text text not null default '',
  storage_path text not null,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
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

create index if not exists assignments_created_at_idx on assignments(created_at desc);
create index if not exists submissions_assignment_id_idx on submissions(assignment_id);
create index if not exists recordings_submission_id_idx on recordings(submission_id);

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
