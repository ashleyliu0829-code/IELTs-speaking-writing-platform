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

create index if not exists daily_tasks_active_dates_idx on daily_tasks(is_active, start_date, end_date);
create index if not exists daily_task_checkins_task_id_idx on daily_task_checkins(task_id);
create index if not exists daily_task_checkins_student_date_idx on daily_task_checkins(student_name, checkin_date desc);

drop trigger if exists daily_tasks_set_updated_at on daily_tasks;
create trigger daily_tasks_set_updated_at
before update on daily_tasks
for each row execute function set_updated_at();
