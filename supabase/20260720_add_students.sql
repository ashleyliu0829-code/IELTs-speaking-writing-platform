create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists students_last_seen_at_idx on students(last_seen_at desc);

insert into students (name, normalized_name, first_seen_at, last_seen_at)
select
  min(student_name) as name,
  lower(trim(student_name)) as normalized_name,
  min(submitted_at) as first_seen_at,
  max(submitted_at) as last_seen_at
from submissions
where trim(student_name) <> ''
group by lower(trim(student_name))
on conflict (normalized_name) do update set
  name = excluded.name,
  last_seen_at = greatest(students.last_seen_at, excluded.last_seen_at);
