-- The speaking score, and the teacher's hand on the marked papers.
--
-- Speaking is the one part the platform cannot see: it happens on a call.
-- So the teacher marks it the way the real test is marked — four criteria,
-- each a band — and the overall band is the mean of the four rounded to the
-- nearest half, which is the examiner's own arithmetic rather than a number
-- anyone has to work out.
--
-- It is held back until the teacher publishes it. A score typed during the
-- call is a note to themselves; the student should see it when the teacher
-- says so, not as it is being typed.
--
-- Reading and listening are already marked and already visible, so an
-- adjustment there takes effect at once and is recorded as an adjustment —
-- a teacher who gives a mark back should be able to see later that they did.

create table if not exists mock_exam_scores (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references mock_exams(id) on delete cascade,
  teacher_id uuid not null references accounts(id) on delete cascade,
  part text not null default 'speaking',
  -- {fluency, lexical, grammar, pronunciation}, each 0..9 in halves.
  criteria jsonb not null default '{}'::jsonb,
  band numeric(3, 1),
  comment text not null default '',
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (exam_id, part)
);

create index if not exists mock_exam_scores_exam_idx on mock_exam_scores(exam_id);

-- When a teacher last changed a marked score by hand.
alter table mock_exam_results
add column if not exists adjusted_at timestamptz;

grant select, insert, update, delete on mock_exam_scores to authenticated;
revoke all on mock_exam_scores from anon;
alter table mock_exam_scores enable row level security;

drop policy if exists mock_exam_scores_staff on mock_exam_scores;
create policy mock_exam_scores_staff on mock_exam_scores
for all to authenticated
using (app_is_staff() and teacher_id = app_teacher_id())
with check (app_is_staff() and teacher_id = app_teacher_id());

-- The student reads their own, and only once it has been published.
drop policy if exists mock_exam_scores_student_read on mock_exam_scores;
create policy mock_exam_scores_student_read on mock_exam_scores
for select to authenticated
using (
  published_at is not null
  and exists (
    select 1 from mock_exams e
    where e.id = exam_id and e.student_account_id = app_account_id() and e.is_active
  )
);
