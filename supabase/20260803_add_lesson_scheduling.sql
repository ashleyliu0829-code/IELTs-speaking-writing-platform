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

create index if not exists lesson_slots_start_at_idx on lesson_slots(start_at);
create index if not exists lesson_slots_active_idx on lesson_slots(is_active, start_at);
create index if not exists lesson_bookings_slot_id_idx on lesson_bookings(slot_id);
create index if not exists lesson_bookings_student_account_id_idx on lesson_bookings(student_account_id);
create index if not exists lesson_bookings_status_start_at_idx on lesson_bookings(status, start_at);
drop trigger if exists lesson_slots_set_updated_at on lesson_slots;
create trigger lesson_slots_set_updated_at
before update on lesson_slots
for each row execute function set_updated_at();

drop trigger if exists lesson_bookings_set_updated_at on lesson_bookings;
create trigger lesson_bookings_set_updated_at
before update on lesson_bookings
for each row execute function set_updated_at();
