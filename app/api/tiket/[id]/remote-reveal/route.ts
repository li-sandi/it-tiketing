import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });
}

export async function POST(
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

  const { id: ticketId } = await params;
  if (!UUID_PATTERN.test(ticketId)) {
    return jsonError("ID tiket tidak valid.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Belum login.", 401);

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return jsonError("Gagal memeriksa peran.", 500);

  const role = profile?.peran;
  if (role !== "it" && role !== "admin") {
    return jsonError("Hanya IT atau admin yang dapat membuka kredensial remote.", 403);
  }

  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select("id, it_id, status")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) return jsonError("Gagal membaca tiket.", 500);
  if (!ticket) return jsonError("Tiket tidak ditemukan.", 404);
  if (role !== "admin" && ticket.it_id !== user.id) {
    return jsonError(
      "Kredensial remote hanya dapat dibuka oleh IT pemegang tiket atau admin.",
      403,
    );
  }

  const [{ data: creds, error: credsError }, { data: remoteAttachments, error: attError }] =
    await Promise.all([
      admin
        .from("remote_credentials")
        .select("id, aplikasi, remote_id, password_terenkripsi, kedaluwarsa_pada")
        .eq("ticket_id", ticketId),
      admin
        .from("attachments")
        .select("id, path_file")
        .eq("ticket_id", ticketId)
        .eq("jenis", "foto_remote")
        .order("diunggah_pada", { ascending: true }),
    ]);

  if (credsError || attError) {
    return jsonError("Gagal membaca kredensial remote.", 500);
  }

  const isClosed = ticket.status === "selesai" || ticket.status === "ditutup";
  const now = Date.now();
  const credentials = (creds ?? []).map((row) => {
    let password: string | null = null;
    const expired =
      row.kedaluwarsa_pada !== null &&
      new Date(row.kedaluwarsa_pada).getTime() <= now;
    if (!isClosed && !expired && row.password_terenkripsi) {
      try {
        password = decryptSecret(row.password_terenkripsi);
      } catch (err) {
        console.error("Gagal mendekripsi password remote:", err);
      }
    }
    return {
      id: row.id,
      aplikasi: row.aplikasi,
      remoteId: row.remote_id,
      password,
      expired: isClosed || expired,
    };
  });

  const remotePhotos = await Promise.all(
    (remoteAttachments ?? []).map(async (att) => {
      const { data } = await admin.storage
        .from("ticket-attachments")
        .createSignedUrl(att.path_file, 300);
      return {
        id: att.id,
        url: data?.signedUrl ?? null,
      };
    }),
  );

  await admin.from("ticket_events").insert({
    ticket_id: ticketId,
    aktor_id: user.id,
    jenis: "kredensial_dilihat",
    dari: null,
    ke: role,
  });

  return NextResponse.json(
    { credentials, remotePhotos },
    { headers: PRIVATE_HEADERS },
  );
}
