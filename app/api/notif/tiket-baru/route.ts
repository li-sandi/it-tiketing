import { NextResponse } from "next/server";
import { prosesNotifikasiTiketBaru } from "@/lib/sleman";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
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
  if (authError || !user) {
    return jsonError("Belum login.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Body JSON tidak valid.", 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("ticketId" in body) ||
    typeof body.ticketId !== "string" ||
    !uuidPattern.test(body.ticketId)
  ) {
    return jsonError("ticketId harus berupa UUID yang valid.", 400);
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, status, dibuat_pada")
    .eq("id", body.ticketId)
    .eq("pembuat_id", user.id)
    .maybeSingle();

  if (ticketError) {
    console.error("Gagal memverifikasi tiket untuk notifikasi:", ticketError.message);
    return jsonError("Gagal memverifikasi tiket.", 500);
  }
  if (!ticket) {
    return jsonError("Tiket tidak ditemukan.", 404);
  }

  const createdAt = new Date(ticket.dibuat_pada).getTime();
  const ageMs = Date.now() - createdAt;
  if (
    !(ticket.status === "baru" || ticket.status === "menunggu_pengadaan") ||
    !Number.isFinite(createdAt) ||
    ageMs < 0 ||
    ageMs > 5 * 60 * 1000
  ) {
    return jsonError(
      "Notifikasi hanya dapat dipicu untuk tiket baru yang baru dibuat.",
      409,
    );
  }

  const { warnings, kunjungan } = await prosesNotifikasiTiketBaru(ticket.id);

  if (warnings.length) {
    return NextResponse.json(
      { ok: false, kunjungan, warnings },
      { status: 207, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { ok: true, kunjungan },
    { headers: NO_STORE_HEADERS },
  );
}
