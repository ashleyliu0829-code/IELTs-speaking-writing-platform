alter table recordings
add column if not exists transcript_text text not null default '';
