-- Tie every row to a real Supabase user. Deleting the user (their account)
-- now deletes all of their contacts, moments and follow-ups with it.
--
-- NOT VALID: enforce for new rows without re-checking rows written before
-- sign-in existed (for example, by the local development user).

alter table public.contacts
  add constraint contacts_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade not valid;

alter table public.interactions
  add constraint interactions_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade not valid;

alter table public.follow_ups
  add constraint follow_ups_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade not valid;
