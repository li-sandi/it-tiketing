-- Remove Kota Baru while preserving users, tickets, and schedules.
update public.users
set site_id = null
where site_id = '44444444-4444-4444-4444-444444444444';

update public.tickets
set site_id = null
where site_id = '44444444-4444-4444-4444-444444444444';

update public.it_schedule
set site_id = null
where site_id = '44444444-4444-4444-4444-444444444444';

delete from public.sites
where id = '44444444-4444-4444-4444-444444444444';
