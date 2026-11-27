import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function getAssetOperator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (
    profile?.peran !== "it" &&
    profile?.peran !== "admin" &&
    profile?.peran !== "ga"
  ) {
    return null;
  }
  return user;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const user = await getAssetOperator();
  if (!user) return jsonError("Akses IT, Admin, atau GA diperlukan.", 403);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("ID aset tidak valid.", 400);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data tidak valid.", 400);
  }

  const r = payload as Record<string, unknown>;
  const updates: Record<string, unknown> = {
    diperbarui_pada: new Date().toISOString(),
  };

  if (typeof r.nama_perangkat === "string" && r.nama_perangkat.trim()) {
    updates.nama_perangkat = r.nama_perangkat.trim();
  }
  if (typeof r.tipe === "string") updates.tipe = r.tipe;
  if ("ram_gb" in r) {
    updates.ram_gb =
      r.ram_gb === null || r.ram_gb === "" ? null : Number(r.ram_gb);
  }
  if ("pemegang_nama" in r) {
    updates.pemegang_nama =
      typeof r.pemegang_nama === "string" && r.pemegang_nama.trim()
        ? r.pemegang_nama.trim()
        : null;
  }
  if ("anydesk_id" in r) {
    updates.anydesk_id =
      typeof r.anydesk_id === "string" && r.anydesk_id.trim()
        ? r.anydesk_id.trim()
        : null;
  }
  if ("uv_id" in r) {
    updates.uv_id =
      typeof r.uv_id === "string" && r.uv_id.trim() ? r.uv_id.trim() : null;
  }
  if (typeof r.status === "string") updates.status = r.status;

  const admin = createAdminClient();
  const { error } = await admin.from("assets").update(updates).eq("id", id);
  if (error) return jsonError(`Gagal memperbarui aset: ${error.message}`, 400);

  revalidateTag("assets", { expire: 0 });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const user = await getAssetOperator();
  if (!user) return jsonError("Akses IT, Admin, atau GA diperlukan.", 403);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("ID aset tidak valid.", 400);

  const admin = createAdminClient();
  const { error } = await admin.from("assets").delete().eq("id", id);
  if (error) return jsonError("Gagal menghapus aset.", 500);

  revalidateTag("assets", { expire: 0 });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
