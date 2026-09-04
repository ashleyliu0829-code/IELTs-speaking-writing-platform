-- Activation codes for teacher accounts.
--
-- Teacher registration is open: anyone with the URL can create a workspace, so
-- a link forwarded past the people it was sent to becomes a free account. A
-- code issued per phone number closes that.
--
-- The code is stored in plain text on purpose. The operator has to read it back
-- to send it to the teacher, so it cannot be hashed. Only the service role can
-- read this column — no RLS policy exposes it — and it grants nothing beyond
-- activating the one account it belongs to.

alter table accounts
add column if not exists activation_code text;

alter table accounts
add column if not exists activated_at timestamptz;

-- Everyone who already has an account keeps working. Without this the owner
-- locks themselves out of their own platform on deploy.
update accounts
set activated_at = coalesce(activated_at, now())
where activated_at is null;

create index if not exists accounts_activation_code_idx on accounts(activation_code);

-- Pending teachers, for the operator to read codes from.
create or replace view teacher_activations as
select
  id,
  display_name,
  phone,
  activation_code,
  activated_at,
  created_at
from accounts
where role = 'teacher'
order by created_at desc;

revoke all on teacher_activations from anon, authenticated;
