import { NextResponse } from "next/server";
import { notifP0Broadcast, notifTiketBaru } from "@/lib/notifikasi";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("ticketId" in body) ||
    typeof body.ticketId !== "string" ||
    !uuidPattern.test(body.ticketId)
  ) {
    return NextResponse.json(
      { error: "ticketId harus berupa UUID yang valid." },
      { status: 400 },
    );
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, status, dibuat_pada")
    .eq("id", body.ticketId)
    .eq("pembuat_id", user.id)
    .maybeSingle();

  if (ticketError) {
    console.error("Gagal memverifikasi tiket untuk notifikasi:", ticketError.message);
    return NextResponse.json(
      { error: "Gagal memverifikasi tiket." },
      { status: 500 },
    );
  }
  if (!ticket) {
    return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
  }

  const createdAt = new Date(ticket.dibuat_pada).getTime();
  const ageMs = Date.now() - createdAt;
  if (
    ticket.status !== "baru" ||
    !Number.isFinite(createdAt) ||
    ageMs < 0 ||
    ageMs > 5 * 60 * 1000
  ) {
    return NextResponse.json(
      { error: "Notifikasi hanya dapat dipicu untuk tiket baru yang baru dibuat." },
      { status: 409 },
    );
  }

  const results = await Promise.allSettled([
    notifTiketBaru(ticket.id),
    notifP0Broadcast(ticket.id),
  ]);
  const warnings = results.flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : "Pengiriman notifikasi gagal.",
        ]
      : [],
  );

  if (warnings.length) {
    return NextResponse.json(
      { ok: false, warnings },
      { status: 207 },
    );
  }
  return NextResponse.json({ ok: true });
}
