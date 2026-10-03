-- Product pass: calendar reconnect state, profile photos, contact sharing
-- and invites. Like calendar_connections, these tables are read and written
-- only by the backend (RLS on, no policies).

-- Google said no (access removed, or a 7-day testing token expired): keep
-- the connection so Profile can say "Reconnect" instead of silently forgetting it.
alter table public.calendar_connections add column needs_reauth boolean not null default false;

-- The Google Calendar event's own link, to open it from a follow-up.
alter table public.follow_ups add column calendar_event_link text;

create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- A small photo (data URL, resized in the app before upload).
  avatar text check (avatar is null or length(avatar) <= 400000),
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;

-- Contacts one user shares with another, by email. The recipient sees them
-- after signing in with that email (or opening the link) and must accept.
create table public.contact_shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_name text not null,
  recipient_email text not null,
  recipient_id uuid references auth.users (id) on delete set null,
  contacts jsonb not null,
  message text,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index contact_shares_recipient_idx on public.contact_shares (lower(recipient_email)) where status = 'pending';
alter table public.contact_shares enable row level security;

-- Who joined through whose invite (ready for "invite friends" rewards later).
create table public.invite_redemptions (
  invitee_id uuid primary key references auth.users (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index invite_redemptions_inviter_idx on public.invite_redemptions (inviter_id);
alter table public.invite_redemptions enable row level security;
