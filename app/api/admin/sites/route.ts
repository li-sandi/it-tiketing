import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const adminUser = await getAdminUser();
  if (!adminUser) return jsonError("Akses admin diperlukan.", 403);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sites")
    .select("id, nama, punya_it, jumlah_user, aktif")
    .order("nama");
  if (error) return jsonError("Gagal memuat daftar site.", 500);
  return NextResponse.json(
    { sites: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
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
    return jsonError("Data site tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data site tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const nama = typeof record.nama === "string" ? record.nama.trim() : "";
  const jumlahUser = Number(record.jumlah_user ?? 0);
  const punyaIt = Boolean(record.punya_it);
  const aktif = record.aktif === undefined ? true : Boolean(record.aktif);

  if (nama.length < 2 || nama.length > 100) {
    return jsonError("Nama site harus 2–100 karakter.", 400);
  }
  if (!Number.isSafeInteger(jumlahUser) || jumlahUser < 0 || jumlahUser > 100_000) {
    return jsonError("Jumlah user tidak valid.", 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sites")
    .insert({ nama, jumlah_user: jumlahUser, punya_it: punyaIt, aktif })
    .select("*")
    .single();
  if (error) return jsonError("Gagal menambah site.", 500);

  await logAdminAction({
    aktorId: adminUser.user.id,
    aksi: "create",
    entitas: "site",
    entitasId: data.id,
    ringkasan: `Menambah site "${nama}" (${jumlahUser} user)`,
    detail: { nama, jumlah_user: jumlahUser, punya_it: punyaIt, aktif },
  });

  return NextResponse.json(
    { ok: true, site: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
