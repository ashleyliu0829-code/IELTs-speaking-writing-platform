-- The exam date a student is working towards.
--
-- Two columns rather than one because a date the teacher guessed and a date
-- the student has actually booked are different facts, and the overview has to
-- say which it is showing. An unconfirmed date is still stored as a date — the
-- teacher picks "about three months out" and we write the date that lands on,
-- so the countdown shrinks on its own instead of staying frozen at "3 months".
alter table students
add column if not exists exam_date date;

alter table students
add column if not exists exam_date_confirmed boolean not null default false;
