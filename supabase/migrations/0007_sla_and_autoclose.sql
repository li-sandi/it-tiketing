-- IT Ticketing — SLA cron + auto-close

alter table public.telegram_notification_deliveries
  drop constraint if exists telegram_notification_deliveries_notification_type_check;

alter table public.telegram_notification_deliveries
  add constraint telegram_notification_deliveries_notification_type_check
  check (notification_type in (
    'ticket_new',
    'ticket_p0',
    'ticket_done',
    'sla_respon_mendekati',
    'sla_respon_lewat',
    'sla_resolusi_mendekati',
    'sla_resolusi_lewat',
    'auto_close'
  ));

create index if not exists idx_tickets_sla_active
  on public.tickets (status, sla_respon_batas, sla_resolusi_batas);
