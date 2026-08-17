alter table assignments
add column if not exists assignment_type text not null default 'speaking';

alter table assignments
add column if not exists writing_tasks jsonb not null default '[]'::jsonb;

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

create index if not exists writing_responses_submission_id_idx on writing_responses(submission_id);

drop trigger if exists writing_responses_set_updated_at on writing_responses;
create trigger writing_responses_set_updated_at
before update on writing_responses
for each row execute function set_updated_at();
