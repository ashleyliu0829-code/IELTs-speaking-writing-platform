-- Finishing a sitting, and the reading answer key.
--
-- `completed_at` is the student saying they are done with all four parts. The
-- platform can only see the listening on its own, so the rest needs a person
-- to say so — and that is also what turns the student's page from a paper
-- into a results page.
--
-- Reading is a PDF, so nothing here can mark it. The teacher uploads an
-- answer key alongside the paper, and the student sees it once they have
-- finished, never before.

alter table mock_exams
add column if not exists completed_at timestamptz;

alter table mock_exams
add column if not exists reading_answer_name text not null default '';

alter table mock_exams
add column if not exists reading_answer_path text not null default '';
