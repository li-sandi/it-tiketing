-- Private image storage for ticket attachments.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ticket owners can read their attachments" on public.attachments;
create policy "ticket owners can read their attachments"
on public.attachments for select to authenticated
using (
  exists (
    select 1 from public.tickets t
    where t.id = attachments.ticket_id
      and (
        t.pembuat_id = (select auth.uid())
        or (select public.current_app_role()) in ('it', 'admin')
      )
  )
);

drop policy if exists "ticket owners can add their attachments" on public.attachments;
create policy "ticket owners can add their attachments"
on public.attachments for insert to authenticated
with check (
  jenis = 'foto'
  and exists (
    select 1 from public.tickets t
    where t.id = attachments.ticket_id
      and t.pembuat_id = (select auth.uid())
  )
);

grant select, insert on public.attachments to authenticated;

drop policy if exists "ticket owners can upload their own images" on storage.objects;
create policy "ticket owners can upload their own images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and (storage.foldername(name))[1] = 'tickets'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
  and exists (
    select 1 from public.tickets t
    where t.id::text = (storage.foldername(name))[2]
      and t.pembuat_id = (select auth.uid())
  )
);

drop policy if exists "ticket owners can read their own images" on storage.objects;
create policy "ticket owners can read their own images"
on storage.objects for select to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (storage.foldername(name))[1] = 'tickets'
  and exists (
    select 1 from public.tickets t
    where t.id::text = (storage.foldername(name))[2]
      and t.pembuat_id = (select auth.uid())
  )
);

drop policy if exists "IT and admins can read ticket images" on storage.objects;
create policy "IT and admins can read ticket images"
on storage.objects for select to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (select public.current_app_role()) in ('it', 'admin')
);
