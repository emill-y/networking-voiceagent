-- Public calendar feeds (iCal links) someone added to find real events:
-- a Luma calendar, a Meetup group, their school's or a club's calendar.
-- No RLS policies on purpose: only the backend reads and fetches these.
create table public.event_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

alter table public.event_feeds enable row level security;
