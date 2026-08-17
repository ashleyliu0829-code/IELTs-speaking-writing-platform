create table if not exists teacher_demo_recordings (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references recordings(id) on delete cascade,
  storage_path text not null,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_demo_recordings_recording_id_idx
  on teacher_demo_recordings(recording_id);

drop trigger if exists teacher_demo_recordings_set_updated_at on teacher_demo_recordings;
create trigger teacher_demo_recordings_set_updated_at
before update on teacher_demo_recordings
for each row execute function set_updated_at();
