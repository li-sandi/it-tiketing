alter table public.tickets
  add column if not exists poin_kesulitan integer;

alter table public.tickets
  add column if not exists catatan_solusi text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.tickets'::regclass
      and conname = 'tickets_poin_kesulitan_range_check'
  ) then
    alter table public.tickets
      add constraint tickets_poin_kesulitan_range_check
      check (poin_kesulitan is null or poin_kesulitan between 1 and 5);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.tickets'::regclass
      and conname = 'tickets_catatan_solusi_length_check'
  ) then
    alter table public.tickets
      add constraint tickets_catatan_solusi_length_check
      check (
        catatan_solusi is null
        or pg_catalog.length(pg_catalog.btrim(catatan_solusi)) between 5 and 5000
      );
  end if;
end;
$$;

create or replace function public.validate_ticket_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    if new.poin_kesulitan is null
       or new.poin_kesulitan not between 1 and 5 then
      raise exception 'Poin kesulitan wajib diisi dengan nilai 1 sampai 5.';
    end if;
    if new.catatan_solusi is null
       or pg_catalog.length(pg_catalog.btrim(new.catatan_solusi)) not between 5 and 5000 then
      raise exception 'Catatan solusi wajib berisi 5 sampai 5.000 karakter.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_ticket_completion()
  from public, anon, authenticated;

drop trigger if exists trg_validate_ticket_completion on public.tickets;
create trigger trg_validate_ticket_completion
before update of status, poin_kesulitan, catatan_solusi on public.tickets
for each row execute function public.validate_ticket_completion();

grant update (poin_kesulitan, catatan_solusi)
  on public.tickets to authenticated;
