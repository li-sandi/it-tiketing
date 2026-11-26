import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
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
  { params }: { params: Promise<{ id: string }> },
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
  if (!UUID_PATTERN.test(id)) return jsonError("ID site tidak valid.", 400);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data site tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data site tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("nama" in record) {
    if (typeof record.nama !== "string" || record.nama.trim().length < 2) {
      return jsonError("Nama site minimal 2 karakter.", 400);
    }
    updates.nama = record.nama.trim();
  }
  if ("jumlah_user" in record) {
    const val = Number(record.jumlah_user);
    if (!Number.isSafeInteger(val) || val < 0 || val > 100_000) {
      return jsonError("Jumlah user tidak valid.", 400);
    }
    updates.jumlah_user = val;
  }
  if ("punya_it" in record) {
    if (typeof record.punya_it !== "boolean") {
      return jsonError("Nilai punya_it tidak valid.", 400);
    }
    updates.punya_it = record.punya_it;
  }
  if ("aktif" in record) {
    if (typeof record.aktif !== "boolean") {
      return jsonError("Nilai aktif tidak valid.", 400);
    }
    updates.aktif = record.aktif;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("Tidak ada perubahan.", 400);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("sites").update(updates).eq("id", id);
  if (error) return jsonError("Gagal memperbarui site.", 500);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
