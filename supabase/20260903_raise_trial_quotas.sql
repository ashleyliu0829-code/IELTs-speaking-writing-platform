-- Raise the quota defaults to match observed use.
--
-- The originals were an estimate made before anyone had used the platform:
-- 3600 seconds of transcription a month. Two months of real classes show a
-- student's homework holds about 6.5 minutes of audio at the median, and the
-- busiest month reached 177 minutes across 31 submissions from 6 students — so
-- the cap would have been spent in the first week.
--
-- Ten students on weekly homework is roughly 320 minutes a month. 600 leaves
-- room to grow without a teacher hitting a wall mid-term.

alter table teacher_usage_limits
alter column monthly_asr_seconds set default 36000;

alter table teacher_usage_limits
alter column monthly_ai_calls set default 300;

alter table teacher_usage_limits
alter column monthly_upload_bytes set default 5368709120;

-- Existing rows still carry the old caps.
update teacher_usage_limits
set monthly_asr_seconds = greatest(monthly_asr_seconds, 36000),
    monthly_ai_calls = greatest(monthly_ai_calls, 300),
    monthly_upload_bytes = greatest(monthly_upload_bytes, 5368709120)
where plan = 'trial';
