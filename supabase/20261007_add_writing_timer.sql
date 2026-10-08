-- The exam clock on a writing homework.
--
-- `timed_minutes` is the allowance the teacher set, 0 meaning untimed, which
-- is what every existing homework is. The clock is the teacher's choice per
-- homework, so it lives on the assignment.
--
-- `timer_started_at` is when the student pressed start, and it is written by
-- the server rather than the page: the whole point of the rule — once started,
-- it cannot be stopped or restarted — is that a refresh, a new tab or a closed
-- laptop must not hand back time. The remaining seconds are always derived
-- from this, never from anything the browser kept.

alter table assignments
add column if not exists timed_minutes integer not null default 0
check (timed_minutes >= 0 and timed_minutes <= 600);

alter table submissions
add column if not exists timer_started_at timestamptz;
