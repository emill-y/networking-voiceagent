-- Your voice: a voiceprint saved from a short recording of you reading aloud,
-- so sessions can tell which voice is yours ("[You]") and never add you as
-- someone you met. The recording itself is never stored, only the voiceprint
-- (256 numbers from the WeSpeaker model). It's biometric data: one row per
-- account, deleted with the account, by "Delete all data", or on its own.
create table if not exists public.voiceprints (
  user_id uuid primary key references auth.users (id) on delete cascade,
  print jsonb not null,
  -- How much of your speech it was made from.
  seconds real not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.voiceprints enable row level security;
