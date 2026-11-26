import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["ga", "it", "admin"]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();

  const { data: stocks, error: stocksError } = await supabase
    .from("inventory_stocks")
    .select("id, kode, nama, satuan, jumlah_stok, stok_minimum, catatan, updated_at")
    .order("nama");

  if (stocksError) {
    return NextResponse.json(
      { error: `Gagal memuat stok sparepart: ${stocksError.message}` },
      { status: 500 },
    );
  }

  let movements: Array<Record<string, unknown>> = [];
  if (profile?.peran && ALLOWED_ROLES.has(profile.peran)) {
    const { data: movementRows } = await supabase
      .from("stock_movements")
      .select(
        "id, jenis, perubahan, stok_sebelum, stok_sesudah, catatan, dibuat_pada, stock_id, ticket_id, inventory_stocks(kode, nama, satuan), users:aktor_id(nama), tickets:ticket_id(nomor_tiket)",
      )
      .order("dibuat_pada", { ascending: false })
      .limit(50);

    movements = (movementRows ?? []) as Array<Record<string, unknown>>;
  }

  return NextResponse.json({
    stocks: stocks ?? [],
    movements,
    canManage: Boolean(profile?.peran && ALLOWED_ROLES.has(profile.peran)),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.peran)) {
    return NextResponse.json(
      { error: "Hanya GA, IT, atau Admin yang dapat menambah atau mengubah item stok." },
      { status: 403 },
    );
  }

  let body: {
    kode?: string;
    nama?: string;
    satuan?: string;
    stokMinimum?: number;
    catatan?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body request tidak valid." }, { status: 400 });
  }

  const kode = String(body.kode ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  const nama = String(body.nama ?? "").trim();
  const satuan = String(body.satuan ?? "pcs").trim() || "pcs";
  const stokMinimum = Math.max(0, Math.floor(Number(body.stokMinimum ?? 2)));
  const catatan = body.catatan?.trim() || null;

  if (!kode || kode.length < 2 || !nama) {
    return NextResponse.json(
      { error: "Kode dan nama sparepart wajib diisi." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("inventory_stocks")
    .upsert(
      {
        kode,
        nama,
        satuan,
        stok_minimum: stokMinimum,
        catatan,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kode" },
    )
    .select("id, kode, nama, satuan, jumlah_stok, stok_minimum, catatan, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Gagal menyimpan item stok: ${error.message}` },
      { status: 500 },
    );
  }

  revalidatePath("/stok");
  revalidatePath("/tiket/baru");
  revalidatePath("/lapor");

  return NextResponse.json({ stock: data });
}
