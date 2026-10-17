-- IT Ticketing — Telegram polling and secure account linking

create table if not exists public.bot_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_telegram_id_unique'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_telegram_id_unique unique (telegram_id);
  end if;
end
$$;

create table if not exists public.telegram_link_tokens (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bot_state enable row level security;
alter table public.telegram_link_tokens enable row level security;

revoke all on public.bot_state from public, anon, authenticated;
revoke all on public.telegram_link_tokens from public, anon, authenticated;
grant all on public.bot_state to service_role;
grant all on public.telegram_link_tokens to service_role;

revoke select on public.users from authenticated;
grant select (id, nama, site_id, peran, telegram_id)
on public.users to authenticated;

create or replace function public.redeem_telegram_link(
  p_token_hash text,
  p_chat_id text
)
returns table (result text, user_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_name text;
  linked_chat_id text;
begin
  select token.user_id
    into target_user_id
  from public.telegram_link_tokens as token
  where token.token_hash = p_token_hash
    and token.used_at is null
    and token.expires_at > now()
  for update;

  if target_user_id is null then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select app_user.nama, app_user.telegram_id
    into target_name, linked_chat_id
  from public.users as app_user
  where app_user.id = target_user_id
  for update;

  if not found then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  if linked_chat_id = p_chat_id then
    update public.telegram_link_tokens
      set used_at = now()
    where token_hash = p_token_hash;
    return query select 'already_linked'::text, target_name;
    return;
  end if;

  if exists (
    select 1
    from public.users as app_user
    where app_user.telegram_id = p_chat_id
      and app_user.id <> target_user_id
  ) then
    update public.telegram_link_tokens
      set used_at = now()
    where token_hash = p_token_hash;
    return query select 'chat_in_use'::text, target_name;
    return;
  end if;

  update public.users
    set telegram_id = p_chat_id
  where id = target_user_id;

  update public.telegram_link_tokens
    set used_at = now()
  where token_hash = p_token_hash;

  return query select 'linked'::text, target_name;
exception
  when unique_violation then
    update public.telegram_link_tokens
      set used_at = now()
    where token_hash = p_token_hash;
    return query select 'chat_in_use'::text, target_name;
end
$$;

revoke all on function public.redeem_telegram_link(text, text) from public;
revoke all on function public.redeem_telegram_link(text, text) from anon, authenticated;
grant execute on function public.redeem_telegram_link(text, text) to service_role;

create or replace function public.claim_telegram_poll(p_lock_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_value text;
begin
  insert into public.bot_state (key, value, updated_at)
  values ('telegram_poll_lock', p_lock_id::text, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now()
    where public.bot_state.value = p_lock_id::text
      or public.bot_state.updated_at < now() - interval '60 seconds'
  returning value into claimed_value;

  return claimed_value = p_lock_id::text;
end
$$;

create or replace function public.release_telegram_poll(p_lock_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.bot_state
  where key = 'telegram_poll_lock'
    and value = p_lock_id::text;
  return found;
end
$$;

revoke all on function public.claim_telegram_poll(uuid) from public, anon, authenticated;
revoke all on function public.release_telegram_poll(uuid) from public, anon, authenticated;
grant execute on function public.claim_telegram_poll(uuid) to service_role;
grant execute on function public.release_telegram_poll(uuid) to service_role;
