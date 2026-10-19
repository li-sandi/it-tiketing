import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
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
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("aktif" in payload) ||
    typeof payload.aktif !== "boolean"
  ) {
    return jsonError("Status kategori tidak valid.", 400);
  }

  const { error } = await createAdminClient()
    .from("categories")
    .update({ aktif: payload.aktif })
    .eq("id", id);
  if (error) {
    console.error("Gagal mengubah status kategori:", error.message);
    return jsonError("Gagal menyimpan perubahan kategori.", 500);
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
