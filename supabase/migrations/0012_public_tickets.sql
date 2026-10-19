-- Support tickets submitted by users without an application account.

alter table public.tickets
  alter column pembuat_id drop not null;

alter table public.tickets
  add column pembuat_nama text,
  add column pembuat_kontak text,
  add column akses_token uuid unique;

alter table public.tickets
  add constraint tickets_public_creator_identity_check
  check (
    pembuat_id is not null
    or (
      nullif(btrim(pembuat_nama), '') is not null
      and akses_token is not null
    )
  );

-- Public access is mediated by server routes using the service role and the
-- unguessable access token. Never grant anonymous direct access to ticket rows.
revoke all on public.tickets from anon;
