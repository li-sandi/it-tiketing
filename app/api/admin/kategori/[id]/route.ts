import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminUser } from "@/lib/admin-auth";
import { parseAturanKenaikan } from "@/lib/prioritas";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/admin/kategori/[id]">,
) {
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

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("ID kategori tidak valid.", 400);

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
  const updates: Record<string, unknown> = {};

  if ("aktif" in record) {
    if (typeof record.aktif !== "boolean") {
      return jsonError("Status kategori tidak valid.", 400);
    }
    updates.aktif = record.aktif;
  }
  if ("nama" in record) {
    if (typeof record.nama !== "string" || record.nama.trim().length < 2) {
      return jsonError("Nama kategori minimal 2 karakter.", 400);
    }
    updates.nama = record.nama.trim();
  }
  if ("grup" in record) {
    if (typeof record.grup !== "string" || record.grup.trim().length < 2) {
      return jsonError("Grup kategori minimal 2 karakter.", 400);
    }
    updates.grup = record.grup.trim();
  }
  if ("tipe" in record) {
    if (
      record.tipe !== "insiden" &&
      record.tipe !== "permintaan" &&
      record.tipe !== "internal"
    ) {
      return jsonError("Tipe kategori tidak valid.", 400);
    }
    updates.tipe = record.tipe;
  }
  if ("prioritas_default" in record) {
    if (
      record.prioritas_default !== "P0" &&
      record.prioritas_default !== "P1" &&
      record.prioritas_default !== "P2" &&
      record.prioritas_default !== "P3"
    ) {
      return jsonError("Prioritas default tidak valid.", 400);
    }
    updates.prioritas_default = record.prioritas_default;
  }
  if ("prioritas_naik" in record) {
    if (record.prioritas_naik === null) {
      updates.prioritas_naik = null;
    } else {
      const parsed = parseAturanKenaikan(record.prioritas_naik);
      if (!parsed) {
        return jsonError("Aturan kenaikan prioritas tidak valid.", 400);
      }
      updates.prioritas_naik = parsed;
    }
  }
  for (const flag of [
    "butuh_aset",
    "butuh_foto",
    "bisa_remote",
    "butuh_approval",
  ] as const) {
    if (flag in record) {
      if (typeof record[flag] !== "boolean") {
        return jsonError(`Flag ${flag} tidak valid.`, 400);
      }
      updates[flag] = record[flag];
    }
  }

  const admin = createAdminClient();
  if ("stock_kode" in record) {
    if (record.stock_kode === null || record.stock_kode === "") {
      updates.stock_kode = null;
    } else if (typeof record.stock_kode === "string") {
      const stockKode = record.stock_kode.trim();
      const { data: stockRow } = await admin
        .from("inventory_stocks")
        .select("kode")
        .eq("kode", stockKode)
        .maybeSingle();
      if (!stockRow) {
        return jsonError("Kode stok sparepart tidak ditemukan.", 400);
      }
      updates.stock_kode = stockKode;
    } else {
      return jsonError("Kode stok sparepart tidak valid.", 400);
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("Tidak ada perubahan yang dikirim.", 400);
  }

  const { error } = await admin
    .from("categories")
    .update(updates)
    .eq("id", id);
  if (error) {
    console.error("Gagal mengubah kategori:", error.message);
    return jsonError("Gagal menyimpan perubahan kategori.", 500);
  }

  await logAdminAction({
    aktorId: adminUser.user.id,
    aksi: "update",
    entitas: "kategori",
    entitasId: id,
    ringkasan: `Memperbarui kategori ${id}: ${Object.keys(updates).join(", ")}`,
    detail: updates,
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
