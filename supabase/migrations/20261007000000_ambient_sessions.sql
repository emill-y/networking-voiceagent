-- Ambient sessions: record a whole networking event (phone, web or Apple
-- Watch), transcribe it in short chunks, and find the people you met.
-- Audio is never stored; transcripts are deleted when the session is saved
-- or discarded, and abandoned sessions are removed after 7 days.
create table public.ambient_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  status text not null default 'recording' check (status in ('recording', 'ready')),
  -- [{seq, text, seconds}] in arrival order; joined by seq.
  segments jsonb not null default '[]',
  audio_seconds real not null default 0,
  -- People found per transcript window ({"0": [...], "1": [...]}), merged on read.
  windows jsonb not null default '{}',
  -- Lets a paired Apple Watch upload to this one session without the user's sign-in token.
  upload_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create index ambient_sessions_user_idx on public.ambient_sessions (user_id, created_at desc);
alter table public.ambient_sessions enable row level security;
