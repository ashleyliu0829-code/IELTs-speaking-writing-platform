-- Per-teacher metering for the paid metered resources: Tencent ASR minutes,
-- OpenAI tokens, and stored audio/image bytes. Without this every teacher's
-- usage lands on one shared API key with no way to attribute or cap it.

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references accounts(id) on delete set null,
  -- who triggered it; may differ from teacher_id (assistant or student)
  account_id uuid references accounts(id) on delete set null,
  event_type text not null check (
    event_type in ('asr_transcribe', 'ai_feedback', 'ai_writing_review', 'storage_upload')
  ),
  quantity numeric not null default 0,
  unit text not null check (unit in ('seconds', 'tokens', 'bytes', 'calls')),
  -- estimated spend in millionths of a CNY, so integers stay exact
  cost_micros bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_teacher_created_idx
on usage_events(teacher_id, created_at desc);

create index if not exists usage_events_teacher_type_created_idx
on usage_events(teacher_id, event_type, created_at desc);

-- Per-teacher caps. A row is created lazily on first use with trial defaults.
create table if not exists teacher_usage_limits (
  teacher_id uuid primary key references accounts(id) on delete cascade,
  plan text not null default 'trial',
  monthly_asr_seconds integer not null default 3600,
  monthly_ai_calls integer not null default 200,
  monthly_upload_bytes bigint not null default 2147483648,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists teacher_usage_limits_updated_at on teacher_usage_limits;
create trigger teacher_usage_limits_updated_at
before update on teacher_usage_limits
for each row execute function set_updated_at();

-- Calendar-month totals per event type, used for quota checks and the
-- teacher-facing usage panel.
create or replace function monthly_usage_totals(target_teacher uuid)
returns table (event_type text, total_quantity numeric, total_cost_micros bigint, event_count bigint)
language sql stable
set search_path = public
as $$
  select
    e.event_type,
    sum(e.quantity) as total_quantity,
    sum(e.cost_micros)::bigint as total_cost_micros,
    count(*)::bigint as event_count
  from usage_events e
  where e.teacher_id = target_teacher
    and e.created_at >= date_trunc('month', now())
  group by e.event_type;
$$;

-- RLS: a teacher reads only their own meter. Writes go through the service
-- role, so there is deliberately no insert policy.
alter table usage_events enable row level security;
alter table teacher_usage_limits enable row level security;

grant select on usage_events to authenticated;
grant select on teacher_usage_limits to authenticated;
revoke all on usage_events from anon;
revoke all on teacher_usage_limits from anon;

drop policy if exists usage_events_select on usage_events;
create policy usage_events_select on usage_events
for select to authenticated
using (app_is_teacher() and teacher_id = app_teacher_id());

drop policy if exists teacher_usage_limits_select on teacher_usage_limits;
create policy teacher_usage_limits_select on teacher_usage_limits
for select to authenticated
using (app_is_teacher() and teacher_id = app_teacher_id());
