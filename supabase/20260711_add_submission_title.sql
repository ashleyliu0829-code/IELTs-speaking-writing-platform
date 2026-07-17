alter table submissions
add column if not exists submission_title text not null default '';

update submissions
set submission_title = assignments.title
from assignments
where submissions.assignment_id = assignments.id
  and submissions.submission_title = '';
