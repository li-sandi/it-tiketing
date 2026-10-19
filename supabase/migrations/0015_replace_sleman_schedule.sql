create or replace function public.replace_sleman_schedule(
  p_start_date date,
  p_end_date date,
  p_assignments jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if p_end_date <= p_start_date then
    raise exception 'Tanggal akhir harus setelah tanggal mulai.';
  end if;

  if pg_catalog.jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'Jadwal harus berupa daftar entri.';
  end if;

  if pg_catalog.jsonb_array_length(p_assignments) <> 16 then
    raise exception 'Jadwal harus berisi tepat 16 entri.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1286710023);

  delete from public.it_schedule
  where jenis = 'kunjungan_sleman'
    and tanggal >= p_start_date
    and tanggal < p_end_date;

  insert into public.it_schedule (it_id, site_id, tanggal, jenis)
  select assignment.it_id, assignment.site_id, assignment.tanggal, assignment.jenis
  from pg_catalog.jsonb_to_recordset(p_assignments) as assignment(
    it_id uuid,
    site_id uuid,
    tanggal date,
    jenis text
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.replace_sleman_schedule(date, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_sleman_schedule(date, date, jsonb)
  to service_role;
