-- Tabel log audit aksi Admin (kategori, site, user, pengaturan)
-- Tidak menggunakan DROP. RLS ketat hanya untuk peran admin.

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aktor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  aksi text NOT NULL,
  entitas text NOT NULL,
  entitas_id text,
  ringkasan text NOT NULL,
  detail jsonb,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_dibuat_pada
  ON public.admin_audit_logs (dibuat_pada DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_logs FROM public, anon;
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_audit_logs'
      AND policyname = 'Admins can read audit logs'
  ) THEN
    CREATE POLICY "Admins can read audit logs"
      ON public.admin_audit_logs FOR SELECT
      TO authenticated
      USING ((SELECT public.current_app_role()) = 'admin');
  END IF;
END $$;
