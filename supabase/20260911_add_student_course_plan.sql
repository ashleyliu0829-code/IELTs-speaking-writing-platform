-- Which course the student is on.
--
-- Free text rather than an enum: the list of plans is a commercial decision
-- that will change faster than a migration can follow, so the app owns the
-- options and the column just records what was chosen. Empty means unset.
alter table students
add column if not exists course_plan text not null default '';
