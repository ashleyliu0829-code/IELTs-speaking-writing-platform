-- Deduplicate and backfill the orphaned `students` profile rows.
--
-- The orphans are not distinct students: 255 rows cover 5 names. The unique
-- index is (teacher_id, normalized_name) and Postgres treats NULLs as distinct,
-- so every upsert with a null teacher_id inserted instead of updating. The rows
-- must be collapsed before teacher_id is filled in, or the backfill trips the
-- very constraint that was being bypassed.
--
-- The matching application fix is in src/lib/students.ts; the NOT NULL at the
-- end of this file is what makes the bug structurally impossible to repeat.
--
-- Every statement is self-contained, so it does not matter how the SQL editor
-- groups them into transactions.
--
-- Must run before the application code is deployed.

do $$
declare
  teacher_count int;
begin
  select count(*) into teacher_count from accounts where role = 'teacher';

  if teacher_count <> 1 then
    raise exception
      'Backfill expects exactly 1 teacher account, found %. Assign these profiles per workspace instead.',
      teacher_count;
  end if;
end $$;

-- Left over from an earlier revision of this migration.
drop table if exists student_survivors;

-- Fold every duplicate's history into the row that will survive, so no
-- first/last seen data is lost when the rest are deleted. The survivor is the
-- one already linked to an account, else the most recently seen.
with agg as (
  select
    normalized_name,
    min(first_seen_at) as first_seen_at,
    max(last_seen_at) as last_seen_at,
    (array_remove(array_agg(account_id order by last_seen_at desc), null))[1] as account_id,
    (array_remove(array_agg(phone order by last_seen_at desc), null))[1] as phone
  from students
  where teacher_id is null
  group by normalized_name
),
survivor as (
  select distinct on (normalized_name) id, normalized_name
  from students
  where teacher_id is null
  order by normalized_name, (account_id is not null) desc, last_seen_at desc, id
)
update students s
set first_seen_at = agg.first_seen_at,
    last_seen_at = agg.last_seen_at,
    account_id = coalesce(s.account_id, agg.account_id),
    phone = coalesce(s.phone, agg.phone)
from survivor
join agg on agg.normalized_name = survivor.normalized_name
where s.id = survivor.id;

-- Drop everything but the survivor of each name.
delete from students
where id in (
  select id from (
    select
      id,
      row_number() over (
        partition by normalized_name
        order by (account_id is not null) desc, last_seen_at desc, id
      ) as rn
    from students
    where teacher_id is null
  ) ranked
  where ranked.rn > 1
);

-- A survivor may collide with a profile the teacher already owns under the same
-- name. Merge into the existing row rather than fail on the unique index.
update students existing
set first_seen_at = least(existing.first_seen_at, orphan.first_seen_at),
    last_seen_at = greatest(existing.last_seen_at, orphan.last_seen_at),
    account_id = coalesce(existing.account_id, orphan.account_id),
    phone = coalesce(existing.phone, orphan.phone)
from students orphan
where orphan.teacher_id is null
  and existing.teacher_id = (select id from accounts where role = 'teacher' limit 1)
  and existing.normalized_name = orphan.normalized_name;

delete from students orphan
where orphan.teacher_id is null
  and exists (
    select 1 from students existing
    where existing.teacher_id = (select id from accounts where role = 'teacher' limit 1)
      and existing.normalized_name = orphan.normalized_name
  );

-- Whatever is left is a genuinely new profile for this workspace.
update students
set teacher_id = (select id from accounts where role = 'teacher' limit 1)
where teacher_id is null;

-- Close the hole for good: a profile with no workspace is invisible under RLS
-- and only ever accumulates as junk.
alter table students
alter column teacher_id set not null;
