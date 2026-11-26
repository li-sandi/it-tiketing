import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Belum login.", 401);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const grup = searchParams.get("grup")?.trim() ?? "";

  let query = supabase
    .from("knowledge_articles")
    .select(
      "id, judul, grup, category_id, masalah, solusi, kata_kunci, sumber_ticket_id, status, dibuat_pada, diperbarui_pada",
    )
    .order("diperbarui_pada", { ascending: false })
    .limit(100);

  if (grup) query = query.eq("grup", grup);
  if (q) query = query.textSearch("search_vector", q, { type: "websearch" });

  const { data, error } = await query;
  if (error) return jsonError("Gagal memuat artikel wiki.", 500);
  return NextResponse.json(
    { articles: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
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
  if (!user) return jsonError("Belum login.", 401);

  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.peran !== "it" && profile?.peran !== "admin") {
    return jsonError("Hanya IT atau admin yang dapat membuat artikel SOP.", 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data artikel tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data artikel tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const judul = typeof record.judul === "string" ? record.judul.trim() : "";
  const grup = typeof record.grup === "string" ? record.grup.trim() : "Lainnya";
  const masalah = typeof record.masalah === "string" ? record.masalah.trim() : "";
  const solusi = typeof record.solusi === "string" ? record.solusi.trim() : "";
  const status = record.status === "published" ? "published" : "draft";
  const categoryId =
    typeof record.category_id === "string" && record.category_id
      ? record.category_id
      : null;
  const sumberTicketId =
    typeof record.sumber_ticket_id === "string" && record.sumber_ticket_id
      ? record.sumber_ticket_id
      : null;
  const kataKunci = Array.isArray(record.kata_kunci)
    ? record.kata_kunci
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter(Boolean)
    : typeof record.kata_kunci === "string"
      ? record.kata_kunci
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

  if (judul.length < 3 || judul.length > 200) {
    return jsonError("Judul artikel harus 3–200 karakter.", 400);
  }
  if (masalah.length < 5 || masalah.length > 5000) {
    return jsonError("Deskripsi masalah harus 5–5000 karakter.", 400);
  }
  if (solusi.length < 5 || solusi.length > 10000) {
    return jsonError("Langkah solusi harus 5–10000 karakter.", 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("knowledge_articles")
    .insert({
      judul,
      grup: grup || "Lainnya",
      category_id: categoryId,
      masalah,
      solusi,
      kata_kunci: kataKunci,
      sumber_ticket_id: sumberTicketId,
      status,
      dibuat_oleh: user.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Gagal menyimpan artikel wiki:", error.message);
    return jsonError("Gagal menyimpan artikel wiki.", 500);
  }

  return NextResponse.json(
    { ok: true, article: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
