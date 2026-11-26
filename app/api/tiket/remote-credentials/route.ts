import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
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
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Belum login.", 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data kredensial tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data kredensial tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const ticketId = typeof record.ticketId === "string" ? record.ticketId : "";
  const anydeskId = typeof record.anydeskId === "string" ? record.anydeskId.trim() : "";
  const anydeskPassword =
    typeof record.anydeskPassword === "string" ? record.anydeskPassword.trim() : "";
  const uvId = typeof record.uvId === "string" ? record.uvId.trim() : "";
  const uvPassword =
    typeof record.uvPassword === "string" ? record.uvPassword.trim() : "";

  if (!UUID_PATTERN.test(ticketId)) {
    return jsonError("ID tiket tidak valid.", 400);
  }
  if (
    anydeskId.length > 120 ||
    uvId.length > 120 ||
    anydeskPassword.length > 200 ||
    uvPassword.length > 200
  ) {
    return jsonError("Kredensial remote terlalu panjang.", 400);
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("pembuat_id", user.id)
    .maybeSingle();
  if (ticketError) return jsonError("Gagal memverifikasi tiket.", 500);
  if (!ticket) return jsonError("Tiket tidak ditemukan.", 404);

  let encAnydesk: string | null = null;
  let encUv: string | null = null;
  try {
    if (anydeskPassword) encAnydesk = encryptSecret(anydeskPassword);
    if (uvPassword) encUv = encryptSecret(uvPassword);
  } catch (err) {
    console.error("Gagal enkripsi kredensial remote:", err);
    return jsonError("Konfigurasi enkripsi kredensial belum tersedia.", 500);
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    ...(anydeskId || encAnydesk
      ? [
          {
            ticket_id: ticketId,
            aplikasi: "anydesk",
            remote_id: anydeskId || "-",
            password_terenkripsi: encAnydesk,
            kedaluwarsa_pada: encAnydesk ? expiresAt : null,
          },
        ]
      : []),
    ...(uvId || encUv
      ? [
          {
            ticket_id: ticketId,
            aplikasi: "uv",
            remote_id: uvId || "-",
            password_terenkripsi: encUv,
            kedaluwarsa_pada: encUv ? expiresAt : null,
          },
        ]
      : []),
  ];

  if (!rows.length) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("remote_credentials").insert(rows);
  if (insertError) {
    console.error("Gagal menyimpan kredensial remote:", insertError.message);
    return jsonError("Gagal menyimpan kredensial remote.", 500);
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
