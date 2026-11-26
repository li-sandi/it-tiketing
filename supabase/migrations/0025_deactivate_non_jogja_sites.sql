-- Keep only Debito Jogja active by default; preserve other sites (Depok, Jakarta, Sleman) as inactive until multi-site is enabled.
update public.sites
set aktif = false
where id <> '11111111-1111-1111-1111-111111111111'
  and aktif = true;
