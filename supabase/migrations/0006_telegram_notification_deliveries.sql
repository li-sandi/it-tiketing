-- IT Ticketing — Idempotent Telegram notification delivery

create table if not exists public.telegram_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  notification_type text not null check (
    notification_type in ('ticket_new', 'ticket_p0', 'ticket_done')
  ),
  recipient_chat_id text not null,
  status text not null default 'sending' check (
    status in ('sending', 'sent', 'failed')
  ),
  attempts integer not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (ticket_id, notification_type, recipient_chat_id)
);

alter table public.telegram_notification_deliveries
  enable row level security;
revoke all on public.telegram_notification_deliveries
  from public, anon, authenticated;
grant all on public.telegram_notification_deliveries to service_role;

create or replace function public.claim_telegram_notification(
  p_ticket_id uuid,
  p_notification_type text,
  p_recipient_chat_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  insert into public.telegram_notification_deliveries (
    ticket_id,
    notification_type,
    recipient_chat_id
  )
  values (
    p_ticket_id,
    p_notification_type,
    p_recipient_chat_id
  )
  on conflict (ticket_id, notification_type, recipient_chat_id)
  do update set
    status = 'sending',
    attempts = public.telegram_notification_deliveries.attempts + 1,
    last_error = null,
    updated_at = now()
  where public.telegram_notification_deliveries.status = 'failed'
    or (
      public.telegram_notification_deliveries.status = 'sending'
      and public.telegram_notification_deliveries.updated_at < now() - interval '2 minutes'
    )
  returning id into claimed_id;

  return claimed_id is not null;
end
$$;

create or replace function public.finish_telegram_notification(
  p_ticket_id uuid,
  p_notification_type text,
  p_recipient_chat_id text,
  p_sent boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.telegram_notification_deliveries
  set status = case when p_sent then 'sent' else 'failed' end,
      last_error = case when p_sent then null else left(p_error, 1000) end,
      sent_at = case when p_sent then now() else sent_at end,
      updated_at = now()
  where ticket_id = p_ticket_id
    and notification_type = p_notification_type
    and recipient_chat_id = p_recipient_chat_id
    and status = 'sending';

  return found;
end
$$;

revoke all on function public.claim_telegram_notification(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.finish_telegram_notification(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_telegram_notification(uuid, text, text)
  to service_role;
grant execute on function public.finish_telegram_notification(uuid, text, text, boolean, text)
  to service_role;
