-- Hours of lessons taught, when the teacher wants to state it themselves.
--
-- The overview adds up confirmed past bookings on its own; this column is for
-- when that total is wrong or incomplete (lessons taught before the platform,
-- lessons that never went through the booking page). Null means "use the
-- automatic total".
alter table students
add column if not exists taught_hours_override numeric(6, 1)
check (taught_hours_override is null or taught_hours_override >= 0);
