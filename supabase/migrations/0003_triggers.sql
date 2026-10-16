-- IT Ticketing — Triggers: nomor tiket otomatis & SLA

create sequence if not exists ticket_seq;

create or replace function set_nomor_tiket() returns trigger
language plpgsql as $$
begin
  if new.nomor_tiket is null then
    new.nomor_tiket := 'TKT-' || to_char(now(),'YYYYMMDD') || '-' ||
                       lpad(nextval('ticket_seq')::text, 4, '0');
  end if;
  return new;
end $$;

create trigger trg_set_nomor_tiket
before insert on tickets
for each row execute function set_nomor_tiket();

create or replace function set_sla_batas() returns trigger
language plpgsql as $$
declare
  menit_respon int;
  menit_resolusi int;
begin
  case new.prioritas
    when 'P0' then menit_respon := 5;   menit_resolusi := 30;
    when 'P1' then menit_respon := 15;  menit_resolusi := 120;
    when 'P2' then menit_respon := 30;  menit_resolusi := 240;
    when 'P3' then menit_respon := 120; menit_resolusi := 1440;
  end case;

  new.sla_respon_batas   := new.dibuat_pada + (menit_respon   || ' minutes')::interval;
  new.sla_resolusi_batas := new.dibuat_pada + (menit_resolusi || ' minutes')::interval;
  return new;
end $$;

create trigger trg_set_sla_batas
before insert on tickets
for each row execute function set_sla_batas();
