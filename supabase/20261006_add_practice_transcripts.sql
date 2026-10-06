-- Transcripts for self-practice recordings.
--
-- Practice answers were recorded, played back and commented on, but never
-- transcribed: the columns only existed on `recordings`, the homework table.
-- A teacher marking a practice had the audio and nothing to correct, which is
-- most of what marking speaking is.

alter table speaking_practice_recordings
add column if not exists transcript_text text not null default '';

alter table speaking_practice_recordings
add column if not exists corrected_transcript_text text not null default '';
