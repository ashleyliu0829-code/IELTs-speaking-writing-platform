-- Trial lessons alongside regular ones.
--
-- A trial reserves an hour; a regular hour-long lesson reserves ninety minutes.
-- The length was previously implied by course_minutes alone, which left no way
-- to say "this is a trial" — worth recording in its own right, since trials are
-- how a student starts and the conversion rate is a number the teacher cares
-- about.

alter table lesson_bookings
add column if not exists booking_type text not null default 'regular';

alter table lesson_bookings
drop constraint if exists lesson_bookings_booking_type_check;

alter table lesson_bookings
add constraint lesson_bookings_booking_type_check
check (booking_type in ('trial', 'regular', 'practice'));

-- reserved_minutes only allowed 90 and 150, so a trial (60) could not be
-- stored. Assistant practice lessons already tried to insert 60 and have been
-- failing this same check since that feature shipped.
alter table lesson_bookings
drop constraint if exists lesson_bookings_reserved_minutes_check;

alter table lesson_bookings
add constraint lesson_bookings_reserved_minutes_check
check (reserved_minutes in (60, 90, 150));

-- Existing rows on practice slots are practice lessons; everything else keeps
-- the default of 'regular'.
update lesson_bookings b
set booking_type = 'practice'
from lesson_slots s
where b.slot_id = s.id
  and s.lesson_type = 'practice'
  and b.booking_type = 'regular';

create index if not exists lesson_bookings_type_start_idx
on lesson_bookings(booking_type, start_at desc);
