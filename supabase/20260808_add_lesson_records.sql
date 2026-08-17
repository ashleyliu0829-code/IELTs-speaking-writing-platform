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

create index if not exists lesson_records_student_lesson_at_idx on lesson_records(student_name, lesson_at desc);

drop trigger if exists lesson_records_set_updated_at on lesson_records;
create trigger lesson_records_set_updated_at
before update on lesson_records
for each row execute function set_updated_at();
