alter table lesson_bookings
add column if not exists cancelled_by text,
add column if not exists cancelled_at timestamptz,
add column if not exists teacher_suggested_time text not null default '';

alter table lesson_bookings
drop constraint if exists lesson_bookings_status_check;

update lesson_bookings
set status = 'confirmed'
where status = 'booked';

alter table lesson_bookings
add constraint lesson_bookings_status_check
check (status in ('pending', 'confirmed', 'cancelled'));

alter table lesson_bookings
drop constraint if exists lesson_bookings_cancelled_by_check;

alter table lesson_bookings
add constraint lesson_bookings_cancelled_by_check
check (cancelled_by is null or cancelled_by in ('teacher', 'student'));
