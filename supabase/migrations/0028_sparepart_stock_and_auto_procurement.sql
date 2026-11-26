-- Sistem Stok Sparepart (GA + IT/Admin) & Auto-Procurement Bulan Depan
-- Jika tiket terkait RAM / Headset / Mouse / Kabel Power / Charger Laptop dibuat saat stok = 0,
-- tiket otomatis masuk menunggu_pengadaan + SLA dijeda + estimasi tanggal 1 bulan berikutnya (WIB).

-- 1. Tabel inventory_stocks
CREATE TABLE IF NOT EXISTS public.inventory_stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text NOT NULL UNIQUE,
  nama text NOT NULL,
  satuan text NOT NULL DEFAULT 'pcs',
  jumlah_stok integer NOT NULL DEFAULT 0 CHECK (jumlah_stok >= 0),
  stok_minimum integer NOT NULL DEFAULT 2 CHECK (stok_minimum >= 0),
  catatan text,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Tabel stock_movements (riwayat masuk/keluar/opname)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.inventory_stocks(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  jenis text NOT NULL CHECK (jenis IN ('masuk', 'keluar', 'penyesuaian')),
  perubahan integer NOT NULL,
  stok_sebelum integer NOT NULL,
  stok_sesudah integer NOT NULL,
  catatan text,
  aktor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_time
  ON public.stock_movements (stock_id, dibuat_pada DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ticket
  ON public.stock_movements (ticket_id)
  WHERE ticket_id IS NOT NULL;

-- 3. Kolom relasi stok pada categories & tickets + estimasi pengadaan
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS stock_kode text REFERENCES public.inventory_stocks(kode) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS estimasi_pengadaan date,
  ADD COLUMN IF NOT EXISTS stock_kode text REFERENCES public.inventory_stocks(kode) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_pengadaan_status
  ON public.tickets (status, estimasi_pengadaan)
  WHERE status = 'menunggu_pengadaan';

-- 4. Seed awal sparepart standar IT & GA
INSERT INTO public.inventory_stocks (kode, nama, satuan, jumlah_stok, stok_minimum, catatan)
VALUES
  ('ram', 'RAM Laptop (DDR4 / DDR5)', 'keping', 0, 2, 'Stok upgrade RAM laptop karyawan'),
  ('headset', 'Headset Agent / Call Center', 'unit', 0, 3, 'Headset operasional agent & staff'),
  ('mouse', 'Mouse Kabel / Wireless', 'unit', 0, 3, 'Mouse standar kerja'),
  ('kabel_power', 'Kabel Power Laptop / Monitor / PC', 'pcs', 0, 3, 'Kabel power 3-pin / C5 / C13'),
  ('charger_laptop', 'Charger / Adaptor Laptop', 'unit', 0, 2, 'Adaptor charger laptop standar'),
  ('keyboard', 'Keyboard External / Sparepart', 'unit', 0, 2, 'Keyboard external atau pengganti'),
  ('baterai_fan', 'Baterai / Fan Cooling / Thermal Paste', 'unit', 0, 2, 'Sparepart baterai & pendingin laptop')
ON CONFLICT (kode) DO NOTHING;

-- 5. Hubungkan kategori terkait ke stock_kode
UPDATE public.categories
SET stock_kode = 'ram'
WHERE id = 'b24001cf-f320-45f0-b104-b212be1a1cd0';

UPDATE public.categories
SET stock_kode = 'mouse'
WHERE id = 'a94c51d1-2964-4b52-b143-b1f79553bcd6';

UPDATE public.categories
SET stock_kode = 'charger_laptop'
WHERE id = '21a58ec6-279f-47cf-b34c-ec83e9f273c0';

UPDATE public.categories
SET stock_kode = 'kabel_power'
WHERE id = '7a8c4e12-3b69-4d2e-9a11-5f20c9b7e101'
   OR lower(nama) LIKE '%kabel power%';

UPDATE public.categories
SET stock_kode = 'headset'
WHERE id = '7a8c4e12-3b69-4d2e-9a11-5f20c9b7e102'
   OR lower(nama) LIKE '%headset bermasalah%';

-- 6. Enable RLS untuk inventory_stocks & stock_movements
ALTER TABLE public.inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_stocks' AND policyname = 'Authenticated users can read inventory stocks'
  ) THEN
    CREATE POLICY "Authenticated users can read inventory stocks"
      ON public.inventory_stocks FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_stocks' AND policyname = 'GA IT Admin can manage inventory stocks'
  ) THEN
    CREATE POLICY "GA IT Admin can manage inventory stocks"
      ON public.inventory_stocks FOR ALL
      TO authenticated
      USING ((SELECT public.current_app_role()) = ANY (ARRAY['ga', 'it', 'admin']))
      WITH CHECK ((SELECT public.current_app_role()) = ANY (ARRAY['ga', 'it', 'admin']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'GA IT Admin can read stock movements'
  ) THEN
    CREATE POLICY "GA IT Admin can read stock movements"
      ON public.stock_movements FOR SELECT
      TO authenticated
      USING ((SELECT public.current_app_role()) = ANY (ARRAY['ga', 'it', 'admin']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'GA IT Admin can insert stock movements'
  ) THEN
    CREATE POLICY "GA IT Admin can insert stock movements"
      ON public.stock_movements FOR INSERT
      TO authenticated
      WITH CHECK ((SELECT public.current_app_role()) = ANY (ARRAY['ga', 'it', 'admin']));
  END IF;
END $$;

-- 7. Perbarui trigger BEFORE INSERT tiket agar mengecek stok sparepart otomatis
CREATE OR REPLACE FUNCTION public.init_ticket_asset_and_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  matched_asset_id uuid;
  cat_needs_approval boolean := false;
  cat_stock_kode text := null;
  available_stock integer := 0;
BEGIN
  IF NEW.nomor_aset IS NOT NULL AND pg_catalog.btrim(NEW.nomor_aset) <> '' THEN
    SELECT id INTO matched_asset_id
    FROM public.assets
    WHERE lower(nomor_aset) = lower(pg_catalog.btrim(NEW.nomor_aset))
    LIMIT 1;
    IF matched_asset_id IS NOT NULL THEN
      NEW.asset_id := matched_asset_id;
    END IF;
  END IF;

  SELECT
    coalesce(butuh_approval, false),
    stock_kode
  INTO cat_needs_approval, cat_stock_kode
  FROM public.categories
  WHERE id = NEW.category_id;

  NEW.stock_kode := cat_stock_kode;

  IF cat_stock_kode IS NOT NULL THEN
    SELECT coalesce(jumlah_stok, 0)
    INTO available_stock
    FROM public.inventory_stocks
    WHERE kode = cat_stock_kode;

    IF coalesce(available_stock, 0) <= 0 THEN
      NEW.status := 'menunggu_pengadaan';
      NEW.sla_paused_at := pg_catalog.now();
      NEW.approval_status := 'menunggu';
      NEW.estimasi_pengadaan := (
        pg_catalog.date_trunc('month', pg_catalog.now() AT TIME ZONE 'Asia/Jakarta')
        + interval '1 month'
      )::date;
      RETURN NEW;
    END IF;
  END IF;

  IF cat_needs_approval OR coalesce(NEW.rekomendasi_upgrade_ram, false) THEN
    NEW.approval_status := 'menunggu';
  ELSE
    NEW.approval_status := 'tidak_perlu';
  END IF;

  RETURN NEW;
END;
$function$;

-- 8. Log otomatis ticket_events ketika tiket masuk ke menunggu_pengadaan saat dibuat
CREATE OR REPLACE FUNCTION public.log_auto_procurement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status = 'menunggu_pengadaan' THEN
    INSERT INTO public.ticket_events (ticket_id, aktor_id, jenis, dari, ke)
    VALUES (NEW.id, NEW.pembuat_id, 'status', 'baru', 'menunggu_pengadaan');
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.tickets'::regclass
      AND tgname = 'trg_log_auto_procurement_event'
  ) THEN
    CREATE TRIGGER trg_log_auto_procurement_event
      AFTER INSERT ON public.tickets
      FOR EACH ROW
      EXECUTE FUNCTION public.log_auto_procurement_event();
  END IF;
END $$;

-- 9. Perbarui RLS policies pada public.tickets untuk mendukung status awal menunggu_pengadaan
ALTER POLICY "Users can create own new tickets" ON public.tickets
WITH CHECK (
  pembuat_id = (SELECT auth.uid())
  AND status IN ('baru', 'menunggu_pengadaan')
  AND it_id IS NULL
);

ALTER POLICY "IT can update unassigned or assigned tickets" ON public.tickets
USING (
  (SELECT public.current_app_role()) = ANY (ARRAY['it', 'admin'])
  AND (
    it_id = (SELECT auth.uid())
    OR (it_id IS NULL AND status IN ('baru', 'menunggu_pengadaan'))
    OR (SELECT public.current_app_role()) = 'admin'
  )
)
WITH CHECK (
  (SELECT public.current_app_role()) = ANY (ARRAY['it', 'admin'])
  AND (
    it_id = (SELECT auth.uid())
    OR (SELECT public.current_app_role()) = 'admin'
  )
);

-- 10. RPC atomik untuk adjustment & konsumsi stok (anti-race-condition)
CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_kode text,
  p_delta integer,
  p_jenis text,
  p_ticket_id uuid DEFAULT NULL,
  p_catatan text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := public.current_app_role();
  v_actor uuid := coalesce(p_actor_id, v_uid);
  v_stock public.inventory_stocks%ROWTYPE;
  v_next integer;
  v_movement_id uuid;
BEGIN
  IF v_uid IS NOT NULL AND v_role NOT IN ('ga', 'it', 'admin') THEN
    RAISE EXCEPTION 'Akses ditolak: hanya GA, IT, atau Admin yang dapat mengubah stok.'
      USING ERRCODE = '42501';
  END IF;

  IF p_jenis NOT IN ('masuk', 'keluar', 'penyesuaian') THEN
    RAISE EXCEPTION 'Jenis mutasi stok tidak valid: %', p_jenis;
  END IF;

  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Perubahan stok tidak boleh 0.';
  END IF;

  SELECT * INTO v_stock
  FROM public.inventory_stocks
  WHERE kode = p_kode
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sparepart dengan kode % tidak ditemukan.', p_kode;
  END IF;

  v_next := v_stock.jumlah_stok + p_delta;
  IF v_next < 0 THEN
    RAISE EXCEPTION 'Stok % tidak mencukupi (tersedia: %, dibutuhkan: %).',
      v_stock.nama, v_stock.jumlah_stok, abs(p_delta);
  END IF;

  UPDATE public.inventory_stocks
  SET
    jumlah_stok = v_next,
    updated_by = v_actor,
    updated_at = pg_catalog.now()
  WHERE id = v_stock.id;

  INSERT INTO public.stock_movements (
    stock_id, ticket_id, jenis, perubahan, stok_sebelum, stok_sesudah, catatan, aktor_id
  )
  VALUES (
    v_stock.id, p_ticket_id, p_jenis, p_delta, v_stock.jumlah_stok, v_next, p_catatan, v_actor
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'kode', v_stock.kode,
    'nama', v_stock.nama,
    'satuan', v_stock.satuan,
    'stok_sebelum', v_stock.jumlah_stok,
    'stok_sesudah', v_next,
    'stok_minimum', v_stock.stok_minimum
  );
END;
$function$;
