import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["ga", "it", "admin"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Autentikasi diperlukan.", 401);
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
    return jsonError(`Gagal memuat stok sparepart: ${stocksError.message}`, 500);
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

  return NextResponse.json(
    {
      stocks: stocks ?? [],
      movements,
      canManage: Boolean(profile?.peran && ALLOWED_ROLES.has(profile.peran)),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return jsonError("Asal permintaan tidak diizinkan.", 403);
      }
    } catch {
      return jsonError("Header asal permintaan tidak valid.", 403);
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Autentikasi diperlukan.", 401);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.peran)) {
    return jsonError(
      "Hanya GA, IT, atau Admin yang dapat menambah atau mengubah item stok.",
      403,
    );
  }

  let body: {
    kode?: string;
    nama?: string;
    satuan?: string;
    stokMinimum?: unknown;
    catatan?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Body request tidak valid.", 400);
  }

  const kode = String(body.kode ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  const nama = String(body.nama ?? "").trim();
  const satuan = String(body.satuan ?? "pcs").trim() || "pcs";
  let stokMinimum = 2;
  if (body.stokMinimum !== undefined && body.stokMinimum !== null) {
    if (
      typeof body.stokMinimum !== "number" ||
      !Number.isInteger(body.stokMinimum) ||
      body.stokMinimum < 0
    ) {
      return jsonError(
        "Stok minimum harus berupa bilangan bulat non-negatif.",
        400,
      );
    }
    stokMinimum = body.stokMinimum;
  }
  const catatan = body.catatan?.trim() || null;

  if (!kode || kode.length < 2 || !nama) {
    return jsonError("Kode dan nama sparepart wajib diisi.", 400);
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
    return jsonError(`Gagal menyimpan item stok: ${error.message}`, 500);
  }

  revalidateTag("stocks", { expire: 0 });
  revalidatePath("/stok");
  revalidatePath("/tiket/baru");
  revalidatePath("/lapor");

  return NextResponse.json({ stock: data }, { headers: NO_STORE_HEADERS });
}
