-- AI preliminary assessments of speaking submissions, and who may run them.
--
-- The assessment is the teacher's private second opinion: scores on the four
-- IELTS Speaking criteria with the evidence behind them, worked out from the
-- transcripts. It is stored apart from `feedback` — feedback is what the
-- student sees once published; this table is never read by a student route.
--
-- `ai_enabled` on the account is the switch. It defaults to off; the operator
-- turns it on per teacher (scripts/ai-access.mjs), since every run costs
-- tokens.

alter table accounts
add column if not exists ai_enabled boolean not null default false;

create table if not exists ai_assessments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  teacher_id uuid not null references accounts(id) on delete cascade,
  model text not null default '',
  band_estimate numeric(3, 1),
  criteria jsonb not null default '{}'::jsonb,
  summary text not null default '',
  strengths jsonb not null default '[]'::jsonb,
  priorities jsonb not null default '[]'::jsonb,
  per_question jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on ai_assessments to authenticated;
revoke all on ai_assessments from anon;
alter table ai_assessments enable row level security;

drop policy if exists ai_assessments_teacher on ai_assessments;
create policy ai_assessments_teacher on ai_assessments
for all to authenticated
using (app_is_teacher() and teacher_id = app_teacher_id())
with check (app_is_teacher() and teacher_id = app_teacher_id());
