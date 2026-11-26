-- Extend users.peran check constraint to allow 'ga' role
alter table public.users
  drop constraint if exists users_peran_check;

alter table public.users
  add constraint users_peran_check
  check (peran in ('user', 'it', 'admin', 'ga'));
