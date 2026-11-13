-- A session the user didn't name gets a title made up from the conversation
-- ("Hawaii trip plans"). title_auto marks those, so a made-up title is never
-- used as "where you met". Renaming a session clears it.
alter table public.ambient_sessions add column if not exists title_auto boolean not null default false;
