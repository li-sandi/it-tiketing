import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminUser } from "@/lib/admin-auth";
import { parseAturanKenaikan } from "@/lib/prioritas";
import { createAdminClient } from "@/lib/supabase/admin";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return jsonError("Akses admin diperlukan.", 403);

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data kategori tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data kategori tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const nama = typeof record.nama === "string" ? record.nama.trim() : "";
  const grup = typeof record.grup === "string" ? record.grup.trim() : "Lainnya";
  const tipe = record.tipe;
  const prioritasDefault = record.prioritas_default;

  if (nama.length < 2 || nama.length > 150) {
    return jsonError("Nama kategori harus 2 sampai 150 karakter.", 400);
  }
  if (grup.length < 2 || grup.length > 60) {
    return jsonError("Grup kategori harus 2 sampai 60 karakter.", 400);
  }
  if (tipe !== "insiden" && tipe !== "permintaan" && tipe !== "internal") {
    return jsonError("Tipe kategori tidak valid.", 400);
  }
  if (
    prioritasDefault !== "P0" &&
    prioritasDefault !== "P1" &&
    prioritasDefault !== "P2" &&
    prioritasDefault !== "P3"
  ) {
    return jsonError("Prioritas default tidak valid.", 400);
  }

  let prioritasNaik: unknown = null;
  if (record.prioritas_naik !== undefined && record.prioritas_naik !== null) {
    const parsed = parseAturanKenaikan(record.prioritas_naik);
    if (!parsed) {
      return jsonError("Format aturan kenaikan prioritas tidak valid.", 400);
    }
    prioritasNaik = parsed;
  }

  let stockKode: string | null = null;
  if (typeof record.stock_kode === "string" && record.stock_kode.trim()) {
    stockKode = record.stock_kode.trim();
  }

  const admin = createAdminClient();
  if (stockKode) {
    const { data: stockRow } = await admin
      .from("inventory_stocks")
      .select("kode")
      .eq("kode", stockKode)
      .maybeSingle();
    if (!stockRow) {
      return jsonError("Kode stok sparepart tidak ditemukan.", 400);
    }
  }

  const { data, error } = await admin
    .from("categories")
    .insert({
      nama,
      grup,
      tipe,
      prioritas_default: prioritasDefault,
      prioritas_naik: prioritasNaik,
      stock_kode: stockKode,
      butuh_aset: Boolean(record.butuh_aset),
      butuh_foto: Boolean(record.butuh_foto),
      bisa_remote: Boolean(record.bisa_remote),
      butuh_approval: Boolean(record.butuh_approval),
      aktif: record.aktif === undefined ? true : Boolean(record.aktif),
    })
    .select("*")
    .single();

  if (error) {
    console.error("Gagal menambah kategori:", error.message);
    return jsonError("Gagal menambah kategori.", 500);
  }

  revalidateTag("categories", { expire: 0 });

  await logAdminAction({
    aktorId: adminUser.user.id,
    aksi: "create",
    entitas: "kategori",
    entitasId: data.id,
    ringkasan: `Menambah kategori "${nama}" (${grup}, ${prioritasDefault})`,
    detail: { nama, grup, tipe, prioritas_default: prioritasDefault, stock_kode: stockKode },
  });

  return NextResponse.json(
    { ok: true, category: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
