-- Hardening izin eksekusi RPC stok agar role anon/public tidak dapat memanggil langsung lewat PostgREST
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
  v_jwt_role text := auth.role();
  v_role text := public.current_app_role();
  v_actor uuid := coalesce(p_actor_id, v_uid);
  v_stock public.inventory_stocks%ROWTYPE;
  v_next integer;
  v_movement_id uuid;
BEGIN
  IF v_jwt_role <> 'service_role' AND (v_uid IS NULL OR v_role NOT IN ('ga', 'it', 'admin')) THEN
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

REVOKE ALL ON FUNCTION public.adjust_inventory_stock(text, integer, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(text, integer, text, uuid, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_auto_procurement_event() FROM PUBLIC, anon;
