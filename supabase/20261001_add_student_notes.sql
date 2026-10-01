-- What the teacher knows about a student that no submission records: where
-- they are now, what is holding them back, and what the lessons are actually
-- working on.
--
-- Free text, written by hand. The scores on the student's page say what the
-- level is; these say why, and what is being done about it — the part a
-- teacher otherwise keeps in their own notes and loses between lessons.

alter table students
add column if not exists current_level text not null default '';

alter table students
add column if not exists weaknesses text not null default '';

alter table students
add column if not exists focus_notes text not null default '';
