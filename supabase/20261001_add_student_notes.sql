-- What the teacher knows about a student that no submission records, and the
-- documents that go with it.
--
-- `notes` is one free-text box: the level, the weak points, what the lessons
-- are working on — whatever the teacher would otherwise keep in their own
-- notes and lose between lessons. One box rather than fields, because the
-- shape of it differs per student.
--
-- `student_files` is what gets attached to that: the assessment written after
-- a trial lesson, a scanned plan, a photo of a page. The file itself lives in
-- the private `student-files` bucket; this table is the index, and the one
-- place that says which teacher a file belongs to.

alter table students
add column if not exists notes text not null default '';

create table if not exists student_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid not null references accounts(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  size_bytes bigint not null default 0,
  content_type text not null default '',
  uploaded_at timestamptz not null default now()
);

create index if not exists student_files_student_id_idx on student_files(student_id);
create index if not exists student_files_teacher_id_idx on student_files(teacher_id);

grant select, insert, update, delete on student_files to authenticated;
revoke all on student_files from anon;
alter table student_files enable row level security;

-- The teacher's own, and never the student's: an assessment written for the
-- teacher is not something the student's side should be able to read.
drop policy if exists student_files_teacher on student_files;
create policy student_files_teacher on student_files
for all to authenticated
using (app_is_staff() and teacher_id = app_teacher_id())
with check (app_is_staff() and teacher_id = app_teacher_id());
