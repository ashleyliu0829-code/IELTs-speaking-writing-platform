create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('teacher', 'student')),
  phone text not null unique,
  display_name text not null,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table students
add column if not exists phone text;

alter table students
add column if not exists account_id uuid references accounts(id) on delete set null;

create index if not exists accounts_role_idx on accounts(role);
create index if not exists account_sessions_account_id_idx on account_sessions(account_id);
create index if not exists account_sessions_expires_at_idx on account_sessions(expires_at);
