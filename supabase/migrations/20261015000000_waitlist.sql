-- The website waitlist: real signups, each with a referral link and a code
-- reserved for a future friend discount. Only the API reads or writes it.
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text not null,
  email text not null,
  -- Their personal link: nomi-connect.vercel.app/waitlist?ref=<referral_code>
  referral_code text not null unique,
  -- The referral_code of whoever invited them, if anyone.
  referred_by text,
  -- Held for later: friends who join with this code get a founding discount.
  friend_code text not null unique,
  welcome_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index waitlist_email_idx on public.waitlist (lower(email));
create index waitlist_referred_by_idx on public.waitlist (referred_by);
alter table public.waitlist enable row level security;
