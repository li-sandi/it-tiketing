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
  { params }: RouteContext<"/api/admin/users/[id]">,
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
  if (!UUID_PATTERN.test(id)) return jsonError("ID user tidak valid.", 400);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data user tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data user tidak valid.", 400);
  }

  const admin = createAdminClient();
  const update: { peran?: "user" | "it" | "admin"; site_id?: string | null } = {};
  if ("peran" in payload) {
    if (
      payload.peran !== "user" &&
      payload.peran !== "it" &&
      payload.peran !== "admin"
    ) {
      return jsonError("Peran user tidak valid.", 400);
    }
    if (id === adminUser.user.id && payload.peran !== "admin") {
      return jsonError("Anda tidak dapat menghapus peran admin milik sendiri.", 400);
    }
    if (payload.peran !== "admin") {
      const { count, error: countError } = await admin
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("peran", "admin");
      if (countError) {
        console.error("Gagal menghitung admin aktif:", countError.message);
        return jsonError("Gagal memeriksa jumlah admin.", 500);
      }
      if (count === 1) {
        const { data: target, error: targetError } = await admin
          .from("users")
          .select("peran")
          .eq("id", id)
          .maybeSingle();
        if (targetError) {
          console.error("Gagal memeriksa user target:", targetError.message);
          return jsonError("Gagal memeriksa user.", 500);
        }
        if (target?.peran === "admin") {
          return jsonError("Peran admin terakhir tidak dapat dihapus.", 400);
        }
      }
    }
    update.peran = payload.peran;
  }

  if ("site_id" in payload) {
    if (
      payload.site_id !== null &&
      (typeof payload.site_id !== "string" || !UUID_PATTERN.test(payload.site_id))
    ) {
      return jsonError("Site user tidak valid.", 400);
    }
    if (payload.site_id) {
      const { data: site, error: siteError } = await admin
        .from("sites")
        .select("id")
        .eq("id", payload.site_id)
        .maybeSingle();
      if (siteError) {
        console.error("Gagal memeriksa site user:", siteError.message);
        return jsonError("Gagal memeriksa site.", 500);
      }
      if (!site) return jsonError("Site tidak ditemukan.", 404);
    }
    update.site_id = payload.site_id;
  }

  if (Object.keys(update).length !== 1) {
    return jsonError("Pilih satu perubahan peran atau site.", 400);
  }

  const { error } = await admin.from("users").update(update).eq("id", id);
  if (error) {
    console.error("Gagal mengubah user:", error.message);
    return jsonError("Gagal menyimpan perubahan user.", 500);
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
