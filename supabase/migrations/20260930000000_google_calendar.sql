-- Google Calendar sync. One connection per user; the refresh token is
-- encrypted by the backend before it's stored. No RLS policies on purpose:
-- only the backend's server connection may read or write calendar tokens.
create table public.calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token_encrypted text not null,
  push_follow_ups boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;

-- The Google Calendar event created for a follow-up, so it can be updated.
alter table public.follow_ups add column calendar_event_id text;
