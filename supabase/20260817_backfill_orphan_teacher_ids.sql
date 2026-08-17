-- Backfill teacher_id on rows that predate the workspace migration.
-- Must run BEFORE 20260817_enable_rls.sql: once RLS is on, a null teacher_id
-- matches no policy and the row becomes invisible to everyone.
--
-- Deliberately NOT touched here: the orphaned `students` profile rows. They are
-- already invisible under the current app filters, so they are not an RLS
-- regression, and blanket-assigning them would surface a few hundred stale
-- names in the teacher's student list. Decide what they are first.

-- This migration assumes a single-teacher install, which is what makes the
-- fallback assignment unambiguous. Fail loudly rather than mis-assign rows
-- across workspaces if that is no longer true.
do $$
declare
  teacher_count int;
begin
  select count(*) into teacher_count from accounts where role = 'teacher';

  if teacher_count <> 1 then
    raise exception
      'Backfill expects exactly 1 teacher account, found %. Assign the orphaned rows per workspace instead of running this migration.',
      teacher_count;
  end if;
end $$;

-- Submissions inherit the workspace of the assignment they answer. Every
-- assignment already carries a teacher_id, so this needs no guesswork.
update submissions
set teacher_id = assignments.teacher_id
from assignments
where submissions.assignment_id = assignments.id
  and submissions.teacher_id is null
  and assignments.teacher_id is not null;

-- Student accounts left unlinked: without this they lose access entirely once
-- RLS is enabled, because every policy keys off the teacher_id claim.
update accounts
set teacher_id = (select id from accounts where role = 'teacher' limit 1)
where role = 'student'
  and teacher_id is null;

-- Teachers own their own workspace; assistants belong to a teacher.
update accounts
set teacher_id = id
where role = 'teacher'
  and teacher_id is null;

update accounts
set teacher_id = (select id from accounts where role = 'teacher' limit 1)
where role = 'assistant'
  and teacher_id is null;

-- Anything still unresolved after the rules above would silently disappear
-- under RLS, so surface it now instead of at runtime.
do $$
declare
  orphan_submissions int;
  orphan_accounts int;
begin
  select count(*) into orphan_submissions from submissions where teacher_id is null;
  select count(*) into orphan_accounts from accounts where teacher_id is null;

  if orphan_submissions > 0 or orphan_accounts > 0 then
    raise warning
      'Still unassigned after backfill: % submissions, % accounts. These rows will be invisible once RLS is enabled.',
      orphan_submissions, orphan_accounts;
  end if;
end $$;
