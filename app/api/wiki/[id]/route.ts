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

async function requireStaff() {
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
  if (profile?.peran !== "it" && profile?.peran !== "admin") return null;
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

  const user = await requireStaff();
  if (!user) return jsonError("Hanya IT atau admin yang diizinkan.", 403);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("ID artikel tidak valid.", 400);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const updates: Record<string, unknown> = {
    diperbarui_pada: new Date().toISOString(),
  };

  if (typeof record.judul === "string") {
    if (record.judul.trim().length < 3) return jsonError("Judul minimal 3 karakter.", 400);
    updates.judul = record.judul.trim();
  }
  if (typeof record.grup === "string" && record.grup.trim()) {
    updates.grup = record.grup.trim();
  }
  if (typeof record.masalah === "string") {
    if (record.masalah.trim().length < 5) return jsonError("Masalah minimal 5 karakter.", 400);
    updates.masalah = record.masalah.trim();
  }
  if (typeof record.solusi === "string") {
    if (record.solusi.trim().length < 5) return jsonError("Solusi minimal 5 karakter.", 400);
    updates.solusi = record.solusi.trim();
  }
  if (record.status === "draft" || record.status === "published") {
    updates.status = record.status;
  }
  if (Array.isArray(record.kata_kunci)) {
    updates.kata_kunci = record.kata_kunci
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("knowledge_articles")
    .update(updates)
    .eq("id", id);
  if (error) return jsonError("Gagal memperbarui artikel.", 500);

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

  const user = await requireStaff();
  if (!user) return jsonError("Hanya IT atau admin yang diizinkan.", 403);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("ID artikel tidak valid.", 400);

  const admin = createAdminClient();
  const { error } = await admin.from("knowledge_articles").delete().eq("id", id);
  if (error) return jsonError("Gagal menghapus artikel.", 500);

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
