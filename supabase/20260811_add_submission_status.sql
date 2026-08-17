alter table submissions
add column if not exists submission_status text not null default 'submitted'
check (submission_status in ('in_progress', 'submitted', 'reviewed'));

update submissions
set submission_status = 'submitted'
where submission_status is null;

create index if not exists submissions_status_idx
on submissions(teacher_id, submission_status, submitted_at desc);
