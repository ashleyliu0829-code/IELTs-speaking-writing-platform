-- Row Level Security for all tenant tables.
--
-- The app talks to Postgres two ways:
--   * getSupabaseAdmin()      -> service_role, bypasses RLS. Registration,
--                                session lookup, storage signing only.
--   * getSupabaseForAccount() -> `authenticated` role carrying a signed JWT.
--                                Everything below constrains that path.
--
-- JWT claims set in src/lib/supabase.ts:
--   account_id, account_role ('teacher'|'student'|'assistant'),
--   teacher_id (the workspace owner), display_name.

-- ---------------------------------------------------------------------------
-- Claim helpers
-- ---------------------------------------------------------------------------

create or replace function app_account_id()
returns uuid
language sql stable
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'account_id', '')::uuid;
$$;

create or replace function app_account_role()
returns text
language sql stable
set search_path = public
as $$
  select auth.jwt() ->> 'account_role';
$$;

create or replace function app_teacher_id()
returns uuid
language sql stable
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'teacher_id', '')::uuid;
$$;

create or replace function app_is_teacher()
returns boolean
language sql stable
set search_path = public
as $$
  select app_account_role() = 'teacher';
$$;

-- Teachers and assistants both act on the whole workspace; students do not.
create or replace function app_is_staff()
returns boolean
language sql stable
set search_path = public
as $$
  select app_account_role() in ('teacher', 'assistant');
$$;

create or replace function app_student_name()
returns text
language sql stable
set search_path = public
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'display_name', '')));
$$;

-- Practice slots are owned by an assistant account, not by the teacher, so
-- workspace membership cannot be a plain teacher_id equality check.
-- SECURITY DEFINER keeps this from recursing into the accounts policies.
create or replace function app_in_workspace(target uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select target is not null
     and app_teacher_id() is not null
     and (
       target = app_teacher_id()
       or exists (
         select 1 from accounts a
         where a.id = target and a.teacher_id = app_teacher_id()
       )
     );
$$;

revoke execute on function app_in_workspace(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Grants: `authenticated` may attempt DML, RLS decides the rows.
-- `anon` gets nothing.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'assignments', 'students', 'submissions', 'recordings',
    'feedback', 'writing_responses', 'teacher_demo_recordings',
    'daily_tasks', 'daily_task_checkins', 'lesson_slots', 'lesson_bookings',
    'lesson_records', 'speaking_practice_submissions',
    'speaking_practice_recordings'
  ]
  loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- account_sessions is service-role only: RLS on, no grants, no policies.
alter table account_sessions enable row level security;
revoke all on account_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

drop policy if exists accounts_select on accounts;
create policy accounts_select on accounts
for select to authenticated
using (
  id = app_account_id()
  or (app_is_staff() and teacher_id = app_teacher_id())
  -- students may look up their teacher's assistants to book practice lessons
  or (role = 'assistant' and teacher_id = app_teacher_id())
);

drop policy if exists accounts_update on accounts;
create policy accounts_update on accounts
for update to authenticated
using (id = app_account_id() or (app_is_teacher() and teacher_id = app_teacher_id()))
with check (id = app_account_id() or (app_is_teacher() and teacher_id = app_teacher_id()));

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------

drop policy if exists assignments_select on assignments;
create policy assignments_select on assignments
for select to authenticated
using (teacher_id = app_teacher_id());

drop policy if exists assignments_write on assignments;
create policy assignments_write on assignments
for all to authenticated
using (app_is_teacher() and teacher_id = app_teacher_id())
with check (app_is_teacher() and teacher_id = app_teacher_id());

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------

drop policy if exists students_select on students;
create policy students_select on students
for select to authenticated
using (
  teacher_id = app_teacher_id()
  and (app_is_staff() or account_id = app_account_id())
);

drop policy if exists students_write on students;
create policy students_write on students
for all to authenticated
using (app_is_staff() and teacher_id = app_teacher_id())
with check (app_is_staff() and teacher_id = app_teacher_id());

-- ---------------------------------------------------------------------------
-- submissions and their children
-- ---------------------------------------------------------------------------

drop policy if exists submissions_select on submissions;
create policy submissions_select on submissions
for select to authenticated
using (
  teacher_id = app_teacher_id()
  and (app_is_staff() or lower(trim(student_name)) = app_student_name())
);

drop policy if exists submissions_insert on submissions;
create policy submissions_insert on submissions
for insert to authenticated
with check (
  teacher_id = app_teacher_id()
  and (app_is_staff() or lower(trim(student_name)) = app_student_name())
);

drop policy if exists submissions_update on submissions;
create policy submissions_update on submissions
for update to authenticated
using (
  teacher_id = app_teacher_id()
  and (app_is_staff() or lower(trim(student_name)) = app_student_name())
)
with check (teacher_id = app_teacher_id());

drop policy if exists submissions_delete on submissions;
create policy submissions_delete on submissions
for delete to authenticated
using (app_is_staff() and teacher_id = app_teacher_id());

create or replace function app_can_read_submission(target uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (select 1 from submissions s where s.id = target);
$$;

-- recordings, feedback and writing_responses inherit their parent submission's
-- visibility: app_can_read_submission is itself filtered by the policy above.

drop policy if exists recordings_all on recordings;
create policy recordings_all on recordings
for all to authenticated
using (app_can_read_submission(submission_id))
with check (app_can_read_submission(submission_id));

drop policy if exists writing_responses_all on writing_responses;
create policy writing_responses_all on writing_responses
for all to authenticated
using (app_can_read_submission(submission_id))
with check (app_can_read_submission(submission_id));

-- Students only ever see published feedback; staff see drafts too.
drop policy if exists feedback_select on feedback;
create policy feedback_select on feedback
for select to authenticated
using (
  app_can_read_submission(submission_id)
  and (app_is_staff() or published_at is not null)
);

drop policy if exists feedback_write on feedback;
create policy feedback_write on feedback
for all to authenticated
using (app_is_staff() and app_can_read_submission(submission_id))
with check (app_is_staff() and app_can_read_submission(submission_id));

drop policy if exists teacher_demo_recordings_all on teacher_demo_recordings;
create policy teacher_demo_recordings_all on teacher_demo_recordings
for all to authenticated
using (exists (select 1 from recordings r where r.id = recording_id))
with check (exists (select 1 from recordings r where r.id = recording_id));

-- ---------------------------------------------------------------------------
-- daily tasks
-- ---------------------------------------------------------------------------

drop policy if exists daily_tasks_select on daily_tasks;
create policy daily_tasks_select on daily_tasks
for select to authenticated
using (teacher_id = app_teacher_id());

drop policy if exists daily_tasks_write on daily_tasks;
create policy daily_tasks_write on daily_tasks
for all to authenticated
using (app_is_teacher() and teacher_id = app_teacher_id())
with check (app_is_teacher() and teacher_id = app_teacher_id());

drop policy if exists daily_task_checkins_select on daily_task_checkins;
create policy daily_task_checkins_select on daily_task_checkins
for select to authenticated
using (
  exists (select 1 from daily_tasks t where t.id = task_id)
  and (app_is_staff() or lower(trim(student_name)) = app_student_name())
);

drop policy if exists daily_task_checkins_write on daily_task_checkins;
create policy daily_task_checkins_write on daily_task_checkins
for all to authenticated
using (
  exists (select 1 from daily_tasks t where t.id = task_id)
  and (app_is_staff() or lower(trim(student_name)) = app_student_name())
)
with check (
  exists (select 1 from daily_tasks t where t.id = task_id)
  and (app_is_staff() or lower(trim(student_name)) = app_student_name())
);

-- ---------------------------------------------------------------------------
-- lesson scheduling
-- ---------------------------------------------------------------------------

drop policy if exists lesson_slots_select on lesson_slots;
create policy lesson_slots_select on lesson_slots
for select to authenticated
using (app_in_workspace(teacher_id));

drop policy if exists lesson_slots_write on lesson_slots;
create policy lesson_slots_write on lesson_slots
for all to authenticated
using (app_is_staff() and app_in_workspace(teacher_id))
with check (app_is_staff() and app_in_workspace(teacher_id));

drop policy if exists lesson_bookings_select on lesson_bookings;
create policy lesson_bookings_select on lesson_bookings
for select to authenticated
using (
  exists (select 1 from lesson_slots s where s.id = slot_id)
  and (app_is_staff() or student_account_id = app_account_id())
);

drop policy if exists lesson_bookings_write on lesson_bookings;
create policy lesson_bookings_write on lesson_bookings
for all to authenticated
using (
  exists (select 1 from lesson_slots s where s.id = slot_id)
  and (app_is_staff() or student_account_id = app_account_id())
)
with check (
  exists (select 1 from lesson_slots s where s.id = slot_id)
  and (app_is_staff() or student_account_id = app_account_id())
);

drop policy if exists lesson_records_all on lesson_records;
create policy lesson_records_all on lesson_records
for all to authenticated
using (app_is_staff() and teacher_id = app_teacher_id())
with check (app_is_staff() and teacher_id = app_teacher_id());

-- ---------------------------------------------------------------------------
-- self-directed speaking practice
-- ---------------------------------------------------------------------------

drop policy if exists speaking_practice_submissions_select on speaking_practice_submissions;
create policy speaking_practice_submissions_select on speaking_practice_submissions
for select to authenticated
using (
  teacher_id = app_teacher_id()
  and (app_is_staff() or student_account_id = app_account_id())
);

drop policy if exists speaking_practice_submissions_write on speaking_practice_submissions;
create policy speaking_practice_submissions_write on speaking_practice_submissions
for all to authenticated
using (
  teacher_id = app_teacher_id()
  and (app_is_staff() or student_account_id = app_account_id())
)
with check (
  teacher_id = app_teacher_id()
  and (app_is_staff() or student_account_id = app_account_id())
);

drop policy if exists speaking_practice_recordings_all on speaking_practice_recordings;
create policy speaking_practice_recordings_all on speaking_practice_recordings
for all to authenticated
using (exists (select 1 from speaking_practice_submissions p where p.id = practice_submission_id))
with check (exists (select 1 from speaking_practice_submissions p where p.id = practice_submission_id));
