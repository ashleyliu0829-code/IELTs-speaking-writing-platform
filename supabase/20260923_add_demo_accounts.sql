-- Trial accounts: a teacher workspace anyone can open without an activation
-- code, to look around before asking for a real one.
--
-- A trial is a normal teacher account with `is_demo` set, already activated so
-- the guards let it through, and an expiry after which it stops working and
-- the pruning script deletes it (scripts/prune-demos.mjs). Its phone is a
-- generated placeholder, never a real number, so it can never collide with
-- someone signing up properly.
--
-- Being a normal account means RLS already isolates it: a trial sees its own
-- workspace and nothing else, exactly like every other teacher.

alter table accounts
add column if not exists is_demo boolean not null default false;

alter table accounts
add column if not exists demo_expires_at timestamptz;

create index if not exists accounts_demo_idx on accounts(is_demo, demo_expires_at)
where is_demo;
