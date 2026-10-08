-- Mock exams: one sitting, four parts, for one student.
--
-- The parts are deliberately different in kind, because that is what a real
-- sitting is: speaking happens on a call, writing is a homework that already
-- exists on the platform, listening is a self-grading paper the student does
-- in the page, and reading is a PDF. Only listening produces a result the
-- platform can read, so only it has a results table.

create table if not exists mock_exams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references accounts(id) on delete cascade,
  title text not null default '',
  student_name text not null,
  student_account_id uuid references accounts(id) on delete set null,
  -- Part 1: the meeting link the teacher pastes in before the sitting.
  speaking_url text not null default '',
  -- Part 2: a writing homework already on the platform.
  writing_assignment_id uuid references assignments(id) on delete set null,
  -- Part 3: the prepared paper, with its audio stored beside it.
  listening_name text not null default '',
  listening_path text not null default '',
  listening_audio jsonb not null default '{}'::jsonb,
  -- Part 4: a PDF.
  reading_name text not null default '',
  reading_path text not null default '',
  scheduled_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mock_exams_teacher_idx on mock_exams(teacher_id);
create index if not exists mock_exams_student_idx on mock_exams(student_account_id);

-- What the listening paper reported: the counts, and every answer behind them.
create table if not exists mock_exam_results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references mock_exams(id) on delete cascade,
  teacher_id uuid not null references accounts(id) on delete cascade,
  part text not null default 'listening',
  correct integer not null default 0,
  total integer not null default 0,
  detail jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (exam_id, part)
);

create index if not exists mock_exam_results_exam_idx on mock_exam_results(exam_id);

grant select, insert, update, delete on mock_exams to authenticated;
grant select, insert, update, delete on mock_exam_results to authenticated;
revoke all on mock_exams from anon;
revoke all on mock_exam_results from anon;
alter table mock_exams enable row level security;
alter table mock_exam_results enable row level security;

-- The teacher owns the sitting; the student sees only their own, and only
-- once it has been given to them.
drop policy if exists mock_exams_staff on mock_exams;
create policy mock_exams_staff on mock_exams
for all to authenticated
using (app_is_staff() and teacher_id = app_teacher_id())
with check (app_is_staff() and teacher_id = app_teacher_id());

drop policy if exists mock_exams_student_read on mock_exams;
create policy mock_exams_student_read on mock_exams
for select to authenticated
using (teacher_id = app_teacher_id() and student_account_id = app_account_id() and is_active);

drop policy if exists mock_exam_results_staff on mock_exam_results;
create policy mock_exam_results_staff on mock_exam_results
for all to authenticated
using (app_is_staff() and teacher_id = app_teacher_id())
with check (app_is_staff() and teacher_id = app_teacher_id());

-- A student may hand in their own result, and read it back.
drop policy if exists mock_exam_results_student on mock_exam_results;
create policy mock_exam_results_student on mock_exam_results
for all to authenticated
using (exists (select 1 from mock_exams e where e.id = exam_id and e.student_account_id = app_account_id()))
with check (exists (select 1 from mock_exams e where e.id = exam_id and e.student_account_id = app_account_id()));
