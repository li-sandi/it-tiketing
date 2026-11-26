-- IT Ticketing — Knowledge Base (Wiki/SOP) & Ticket Merge

-- 1. Knowledge Articles (Wiki/SOP)
create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  judul text not null check (char_length(btrim(judul)) between 3 and 200),
  grup text not null default 'Lainnya',
  category_id uuid references public.categories(id) on delete set null,
  masalah text not null check (char_length(btrim(masalah)) between 5 and 5000),
  solusi text not null check (char_length(btrim(solusi)) between 5 and 10000),
  kata_kunci text[] not null default '{}',
  sumber_ticket_id uuid references public.tickets(id) on delete set null,
  status text not null check (status in ('draft', 'published')) default 'draft',
  dibuat_oleh uuid references public.users(id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  search_vector tsvector
);

create or replace function public.knowledge_articles_search_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.search_vector := pg_catalog.to_tsvector(
    'simple'::regconfig,
    coalesce(new.judul, '') || ' ' || coalesce(new.masalah, '') || ' ' || coalesce(new.solusi, '') || ' ' || coalesce(pg_catalog.array_to_string(new.kata_kunci, ' '), '')
  );
  return new;
end;
$$;

revoke all on function public.knowledge_articles_search_trigger()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.knowledge_articles'::regclass
      and tgname = 'trg_knowledge_articles_search'
  ) then
    create trigger trg_knowledge_articles_search
    before insert or update of judul, masalah, solusi, kata_kunci
    on public.knowledge_articles
    for each row execute function public.knowledge_articles_search_trigger();
  end if;
end;
$$;

create index if not exists idx_knowledge_articles_search
  on public.knowledge_articles using gin (search_vector);

create index if not exists idx_knowledge_articles_status_grup
  on public.knowledge_articles (status, grup);

alter table public.knowledge_articles enable row level security;
revoke all on public.knowledge_articles from public, anon;
grant select, insert, update, delete on public.knowledge_articles to authenticated;
grant all on public.knowledge_articles to service_role;

create policy "Authenticated read published wiki and staff read all"
on public.knowledge_articles for select to authenticated
using (
  status = 'published'
  or (select public.current_app_role()) in ('it', 'admin')
);

create policy "Staff can create wiki articles"
on public.knowledge_articles for insert to authenticated
with check (
  (select public.current_app_role()) in ('it', 'admin')
);

create policy "Staff can update wiki articles"
on public.knowledge_articles for update to authenticated
using (
  (select public.current_app_role()) in ('it', 'admin')
)
with check (
  (select public.current_app_role()) in ('it', 'admin')
);

create policy "Staff can delete wiki articles"
on public.knowledge_articles for delete to authenticated
using (
  (select public.current_app_role()) in ('it', 'admin')
);

-- 2. Ticket Merge RPC
create or replace function public.merge_tickets(
  p_parent_id uuid,
  p_child_ids uuid[],
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_ticket public.tickets%rowtype;
  child_ticket public.tickets%rowtype;
  child_id uuid;
  merged_count integer := 0;
begin
  select * into parent_ticket
  from public.tickets
  where id = p_parent_id
  for update;

  if not found then
    raise exception 'Tiket induk tidak ditemukan.';
  end if;

  if parent_ticket.digabung_ke_id is not null then
    raise exception 'Tiket induk sudah digabungkan ke tiket lain.';
  end if;

  if parent_ticket.status in ('selesai', 'ditutup') then
    raise exception 'Tiket induk sudah selesai atau ditutup.';
  end if;

  if p_child_ids is null or pg_catalog.array_length(p_child_ids, 1) is null then
    raise exception 'Pilih minimal satu tiket untuk digabungkan.';
  end if;

  foreach child_id in array p_child_ids loop
    if child_id = p_parent_id then
      raise exception 'Tidak dapat menggabungkan tiket ke dirinya sendiri.';
    end if;

    select * into child_ticket
    from public.tickets
    where id = child_id
    for update;

    if not found then
      raise exception 'Tiket anak (%) tidak ditemukan.', child_id;
    end if;

    if child_ticket.status in ('selesai', 'ditutup') then
      raise exception 'Tiket % sudah selesai atau ditutup.', child_ticket.nomor_tiket;
    end if;

    if child_ticket.digabung_ke_id is not null then
      raise exception 'Tiket % sudah digabungkan ke tiket lain.', child_ticket.nomor_tiket;
    end if;

    if exists (select 1 from public.tickets where digabung_ke_id = child_id) then
      raise exception 'Tiket % sudah menjadi induk bagi tiket lain.', child_ticket.nomor_tiket;
    end if;

    update public.tickets
    set digabung_ke_id = p_parent_id,
        it_id = coalesce(parent_ticket.it_id, child_ticket.it_id),
        status = case
          when parent_ticket.status = 'diproses' and child_ticket.status = 'baru' then 'diproses'
          else child_ticket.status
        end,
        diproses_pada = case
          when parent_ticket.status = 'diproses' and child_ticket.diproses_pada is null then pg_catalog.now()
          else child_ticket.diproses_pada
        end
    where id = child_id;

    insert into public.ticket_events (ticket_id, aktor_id, jenis, dari, ke)
    values
      (child_id, p_actor_id, 'merge', child_ticket.nomor_tiket, parent_ticket.nomor_tiket),
      (p_parent_id, p_actor_id, 'merge', child_ticket.nomor_tiket, parent_ticket.nomor_tiket);

    merged_count := merged_count + 1;
  end loop;

  return merged_count;
end;
$$;

revoke all on function public.merge_tickets(uuid, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.merge_tickets(uuid, uuid[], uuid)
  to service_role;

-- 3. Auto-complete merged child tickets when parent ticket finishes
create or replace function public.sync_merged_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  child record;
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    for child in
      select id, status
      from public.tickets
      where digabung_ke_id = new.id
        and status not in ('selesai', 'ditutup')
      for update
    loop
      update public.tickets
      set status = 'selesai',
          selesai_pada = coalesce(new.selesai_pada, pg_catalog.now()),
          poin_kesulitan = new.poin_kesulitan,
          catatan_solusi = 'Diselesaikan melalui tiket induk ' || new.nomor_tiket || ': ' || coalesce(new.catatan_solusi, '')
      where id = child.id;

      insert into public.ticket_events (ticket_id, aktor_id, jenis, dari, ke)
      values (child.id, new.it_id, 'status', child.status, 'selesai');
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_merged_children()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.tickets'::regclass
      and tgname = 'trg_sync_merged_children'
  ) then
    create trigger trg_sync_merged_children
    after update of status on public.tickets
    for each row execute function public.sync_merged_children();
  end if;
end;
$$;
