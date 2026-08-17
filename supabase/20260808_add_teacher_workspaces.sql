alter table accounts
add column if not exists teacher_id uuid references accounts(id) on delete set null;

alter table assignments
add column if not exists teacher_id uuid references accounts(id) on delete set null;

alter table students
add column if not exists teacher_id uuid references accounts(id) on delete set null;

alter table submissions
add column if not exists teacher_id uuid references accounts(id) on delete set null;

alter table daily_tasks
add column if not exists teacher_id uuid references accounts(id) on delete set null;

alter table lesson_records
add column if not exists teacher_id uuid references accounts(id) on delete set null;

update accounts
set teacher_id = id
where role = 'teacher'
  and teacher_id is null;

update assignments
set teacher_id = (select id from accounts where role = 'teacher' order by created_at limit 1)
where teacher_id is null;

update students
set teacher_id = (select id from accounts where role = 'teacher' order by created_at limit 1)
where teacher_id is null;

update submissions
set teacher_id = assignments.teacher_id
from assignments
where submissions.assignment_id = assignments.id
  and submissions.teacher_id is null;

update daily_tasks
set teacher_id = (select id from accounts where role = 'teacher' order by created_at limit 1)
where teacher_id is null;

update lesson_slots
set teacher_id = (select id from accounts where role = 'teacher' order by created_at limit 1)
where teacher_id is null;

update lesson_records
set teacher_id = (select id from accounts where role = 'teacher' order by created_at limit 1)
where teacher_id is null;

create index if not exists accounts_teacher_id_idx on accounts(teacher_id);
create index if not exists assignments_teacher_id_idx on assignments(teacher_id, created_at desc);
create index if not exists students_teacher_id_idx on students(teacher_id, last_seen_at desc);
create index if not exists submissions_teacher_id_idx on submissions(teacher_id, submitted_at desc);
create index if not exists daily_tasks_teacher_id_idx on daily_tasks(teacher_id, start_date desc);
create index if not exists lesson_records_teacher_id_idx on lesson_records(teacher_id, lesson_at desc);

alter table students
drop constraint if exists students_normalized_name_key;

create unique index if not exists students_teacher_normalized_name_key
on students(teacher_id, normalized_name);
