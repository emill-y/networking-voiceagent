-- Sessions become the heart of Nomi: a saved session is kept (title, time,
-- the contacts it created) so it can be revisited, while its transcript is
-- still deleted on save. owner_name lets the AI leave the user out.
alter table public.ambient_sessions add column if not exists owner_name text;
alter table public.ambient_sessions add column if not exists contact_ids uuid[] not null default '{}';
alter table public.ambient_sessions drop constraint if exists ambient_sessions_status_check;
alter table public.ambient_sessions add constraint ambient_sessions_status_check
  check (status in ('recording', 'ready', 'saved'));
