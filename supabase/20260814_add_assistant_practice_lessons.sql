do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'accounts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%teacher%student%';

  if constraint_name is not null then
    execute format('alter table accounts drop constraint %I', constraint_name);
  end if;
end $$;

alter table accounts
add constraint accounts_role_check
check (role in ('teacher', 'student', 'assistant'));

alter table lesson_slots
add column if not exists lesson_type text not null default 'regular';

alter table lesson_slots
drop constraint if exists lesson_slots_lesson_type_check;

alter table lesson_slots
add constraint lesson_slots_lesson_type_check
check (lesson_type in ('regular', 'practice'));

create index if not exists lesson_slots_type_teacher_start_idx
on lesson_slots(lesson_type, teacher_id, start_at);

update lesson_slots
set lesson_type = 'regular'
where lesson_type is null;
