-- The study plan: the phases a student's course runs through on the way to
-- the exam, e.g. 基础提升 → 雅思备考 → 考前冲刺, each with a date range and a
-- one-line focus.
--
-- It lives on the student row because there is one plan per student, and the
-- existing policies already say who may see it: the teacher writes it, the
-- student reads their own row. Shape of each element:
--   { "id": "…", "name": "…", "start_date": "YYYY-MM-DD",
--     "end_date": "YYYY-MM-DD", "focus": "…" }

alter table students
add column if not exists study_plan jsonb not null default '[]'::jsonb;
