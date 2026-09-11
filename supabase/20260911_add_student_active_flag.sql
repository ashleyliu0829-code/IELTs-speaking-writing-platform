-- Whether the student is still taking lessons.
--
-- Nobody is deleted: a student who stops still owns their submissions, their
-- feedback and their score history, and the teacher will want to look those up
-- later. This only decides where they sit in the roster and how loudly.
alter table students
add column if not exists is_active boolean not null default true;
