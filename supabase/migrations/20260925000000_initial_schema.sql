-- Nomi initial schema: people (contacts), moments (interactions), and
-- commitments (follow_ups). Every row belongs to one user.
--
-- Contact vs Interaction: a contact is a person; an interaction is one
-- conversation with them. New conversations add interactions — they never
-- overwrite earlier ones.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  company text,
  role text,
  school text,
  major text,
  location text,
  email text,
  phone text,
  linkedin_url text,
  website_url text,
  summary text,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_recent_idx
  on public.contacts (user_id, last_interaction_at desc nulls last);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  raw_transcript text,
  summary text,
  event text,
  location text,
  interests text[] not null default '{}',
  projects text[] not null default '{}',
  needs text[] not null default '{}',
  topics text[] not null default '{}',
  notes text[] not null default '{}',
  interaction_date timestamptz not null default now(),
  source_type text not null default 'voice'
    check (source_type in ('voice', 'manual', 'calendar', 'email', 'import')),
  created_at timestamptz not null default now()
);

create index interactions_contact_date_idx
  on public.interactions (contact_id, interaction_date desc);
create index interactions_user_idx on public.interactions (user_id);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  interaction_id uuid references public.interactions (id) on delete set null,
  action text not null check (length(btrim(action)) > 0),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index follow_ups_user_status_due_idx
  on public.follow_ups (user_id, status, due_at nulls last);
create index follow_ups_contact_idx on public.follow_ups (contact_id);

-- Keep updated_at honest without relying on application code.
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- Row Level Security: if anyone reaches these tables through Supabase's
-- public API with a user's token, they can only see that user's rows.
-- The FastAPI backend connects with a privileged role (which bypasses RLS)
-- and scopes every query by user_id itself.
alter table public.contacts enable row level security;
alter table public.interactions enable row level security;
alter table public.follow_ups enable row level security;

create policy "Users manage their own contacts" on public.contacts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their own interactions" on public.interactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their own follow-ups" on public.follow_ups
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
