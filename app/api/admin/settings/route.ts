import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_KEYS = new Set([
  "working_hours",
  "rate_limit",
  "feature_flags",
  "weekly_report",
]);

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
    .from("settings")
    .select("kunci, nilai, deskripsi, diperbarui_pada")
    .order("kunci");
  if (error) return jsonError("Gagal membaca pengaturan.", 500);

  return NextResponse.json(
    { settings: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
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
    return jsonError("Data pengaturan tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data pengaturan tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const kunci = typeof record.kunci === "string" ? record.kunci : "";
  if (!ALLOWED_KEYS.has(kunci)) {
    return jsonError("Kunci pengaturan tidak valid.", 400);
  }
  if (typeof record.nilai !== "object" || record.nilai === null || Array.isArray(record.nilai)) {
    return jsonError("Nilai pengaturan harus berupa objek JSON.", 400);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("settings").upsert(
    {
      kunci,
      nilai: record.nilai,
      diperbarui_pada: new Date().toISOString(),
    },
    { onConflict: "kunci" },
  );
  if (error) return jsonError("Gagal menyimpan pengaturan.", 500);

  await logAdminAction({
    aktorId: adminUser.user.id,
    aksi: "update",
    entitas: "settings",
    entitasId: kunci,
    ringkasan: `Mengubah pengaturan sistem "${kunci}"`,
    detail: record.nilai,
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
