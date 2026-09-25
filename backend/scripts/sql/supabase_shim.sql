-- Minimal stand-ins for objects Supabase provides, so migrations can be
-- tested on plain PostgreSQL. Never run this against a Supabase project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Just enough of auth.users for foreign keys.
create table if not exists auth.users (
  id uuid primary key,
  email text,
  phone text
);
