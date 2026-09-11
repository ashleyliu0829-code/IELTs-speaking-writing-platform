-- The teacher's own to-do list, shown on the home page.
--
-- Nothing here is tied to a student or an assignment: it is the teacher's
-- scratch list of things to get done, each optionally with a time. Only the
-- teacher sees it — assistants act on the workspace, not on this.

create table if not exists teacher_todos (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_todos_teacher_idx
on teacher_todos(teacher_id, done, due_at);

drop trigger if exists teacher_todos_set_updated_at on teacher_todos;
create trigger teacher_todos_set_updated_at
before update on teacher_todos
for each row execute function set_updated_at();

grant select, insert, update, delete on teacher_todos to authenticated;
revoke all on teacher_todos from anon;
alter table teacher_todos enable row level security;

drop policy if exists teacher_todos_all on teacher_todos;
create policy teacher_todos_all on teacher_todos
for all to authenticated
using (app_is_teacher() and teacher_id = app_teacher_id())
with check (app_is_teacher() and teacher_id = app_teacher_id());
