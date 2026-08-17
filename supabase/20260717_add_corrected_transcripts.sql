alter table recordings
add column if not exists corrected_transcript_text text not null default '';
