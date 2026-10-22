drop policy if exists "Users can read events for accessible tickets"
  on public.ticket_events;

create policy "Users and staff can read accessible ticket events"
on public.ticket_events for select to authenticated
using (
  exists (
    select 1
    from public.tickets
    where tickets.id = ticket_events.ticket_id
      and (
        tickets.pembuat_id = (select auth.uid())
        or (select public.current_app_role()) in ('it', 'admin')
      )
  )
);
