import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function notFound() {
  return NextResponse.json(
    { error: "Tiket tidak ditemukan." },
    { status: 404, headers: PRIVATE_HEADERS },
  );
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/tiket/publik/[token]">,
) {
  const { token } = await params;
  if (!UUID_PATTERN.test(token)) return notFound();

  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select(
      "id, nomor_tiket, status, prioritas, deskripsi, penanganan, site_id, category_id, it_id, dibuat_pada, selesai_pada, rating",
    )
    .eq("akses_token", token)
    .maybeSingle();

  if (ticketError) {
    console.error("Gagal membaca tiket dengan token publik:", ticketError.message);
    return NextResponse.json(
      { error: "Gagal memuat status tiket." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
  if (!ticket) return notFound();

  const [
    { data: category, error: categoryError },
    { data: site, error: siteError },
    { data: events, error: eventsError },
    { data: attachments, error: attachmentError },
    itResult,
  ] = await Promise.all([
    admin
      .from("categories")
      .select("nama")
      .eq("id", ticket.category_id)
      .maybeSingle(),
    ticket.site_id
      ? admin.from("sites").select("nama").eq("id", ticket.site_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("ticket_events")
      .select("jenis, dari, ke, waktu, aktor_id")
      .eq("ticket_id", ticket.id)
      .order("waktu", { ascending: true })
      .limit(100),
    admin
      .from("attachments")
      .select("id, path_file")
      .eq("ticket_id", ticket.id)
      .order("diunggah_pada", { ascending: true })
      .limit(20),
    ticket.it_id
      ? admin.from("users").select("nama").eq("id", ticket.it_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const { data: it, error: itError } = itResult;
  const relatedError =
    categoryError ?? siteError ?? eventsError ?? attachmentError ?? itError;
  if (relatedError) {
    console.error("Gagal memuat detail tiket publik:", relatedError.message);
    return NextResponse.json(
      { error: "Gagal memuat detail tiket." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }

  const actorIds = Array.from(
    new Set(
      (events ?? [])
        .map((event) => event.aktor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: actors, error: actorError } = actorIds.length
    ? await admin.from("users").select("id, nama").in("id", actorIds)
    : { data: [], error: null };
  if (actorError) {
    console.error("Gagal membaca aktor timeline publik:", actorError.message);
    return NextResponse.json(
      { error: "Gagal memuat riwayat tiket." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
  const actorNames = new Map((actors ?? []).map((actor) => [actor.id, actor.nama]));

  const attachmentsWithUrl = await Promise.all(
    (attachments ?? []).map(async (attachment) => {
      const { data, error } = await admin.storage
        .from("ticket-attachments")
        .createSignedUrl(attachment.path_file, 900);
      if (error) {
        console.error("Gagal membuat URL lampiran tiket publik:", error.message);
      }
      return {
        id: attachment.id,
        url: data?.signedUrl ?? null,
        error: error ? "Lampiran tidak dapat dimuat." : null,
      };
    }),
  );

  return NextResponse.json(
    {
      ok: true,
      tiket: {
        nomor_tiket: ticket.nomor_tiket,
        status: ticket.status,
        prioritas: ticket.prioritas,
        deskripsi: ticket.deskripsi,
        penanganan: ticket.penanganan,
        dibuat_pada: ticket.dibuat_pada,
        selesai_pada: ticket.selesai_pada,
        rating: ticket.rating,
        kategori: category?.nama ?? null,
        site: site?.nama ?? null,
        it: it?.nama ?? null,
      },
      events: (events ?? []).map((event) => ({
        jenis: event.jenis,
        dari: event.dari,
        ke: event.ke,
        waktu: event.waktu,
        aktor: event.aktor_id
          ? actorNames.get(event.aktor_id) ?? "IT"
          : event.ke === "ditutup"
            ? "Pelapor"
            : "Sistem",
      })),
      attachments: attachmentsWithUrl,
    },
    { headers: PRIVATE_HEADERS },
  );
}
