-- What was taught in each lesson, on the booking itself.
--
-- The teacher kept a spreadsheet with one row per lesson: what it covered,
-- which slides were used, what was set afterwards. The bookings table already
-- holds one row per lesson with the student and the time, so the rest of that
-- spreadsheet row lives here rather than in a second table (lesson_records)
-- that had to be kept in step by hand. completed_at is the tick: null until
-- the teacher marks the lesson done.
alter table lesson_bookings
add column if not exists lesson_topic text not null default '',
add column if not exists lesson_material text not null default '',
add column if not exists lesson_sections text[] not null default '{}',
add column if not exists lesson_note text not null default '',
add column if not exists completed_at timestamptz;

create index if not exists lesson_bookings_student_start_idx
on lesson_bookings(student_name, start_at);
