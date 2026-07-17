alter table assignments
add column if not exists assigned_students jsonb not null default '[]'::jsonb;
