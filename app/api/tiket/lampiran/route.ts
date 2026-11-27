import { NextResponse } from "next/server";
import { validateImageFile } from "@/lib/image-validation";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Form upload tidak valid.", 400);
  }

  const ticketId = formData.get("ticketId");
  const file = formData.get("file");
  const jenisRaw = formData.get("jenis");
  const jenis = jenisRaw === "foto_remote" ? "foto_remote" : "foto";

  if (
    typeof ticketId !== "string" ||
    !uuidPattern.test(ticketId) ||
    !(file instanceof File)
  ) {
    return jsonError("ID tiket atau file lampiran tidak valid.", 400);
  }

  const validated = await validateImageFile(file);
  if (!validated.ok) {
    return jsonError(validated.error, 400);
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("pembuat_id", user.id)
    .maybeSingle();

  if (ticketError) {
    console.error("Gagal memverifikasi kepemilikan tiket lampiran:", ticketError.message);
    return jsonError("Gagal memverifikasi tiket.", 500);
  }
  if (!ticket) {
    return jsonError("Tiket tidak ditemukan.", 404);
  }

  const path = `tickets/${ticketId}/${crypto.randomUUID()}.${validated.format.extension}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("ticket-attachments")
    .upload(path, file, {
      contentType: validated.format.mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload file lampiran gagal:", uploadError.message);
    return jsonError(`Upload foto gagal: ${uploadError.message}`, 502);
  }

  const { error: attachmentError } = await admin.from("attachments").insert({
    ticket_id: ticketId,
    path_file: path,
    jenis,
  });

  if (attachmentError) {
    const { error: cleanupError } = await admin.storage
      .from("ticket-attachments")
      .remove([path]);
    console.error("Metadata lampiran gagal disimpan:", attachmentError.message);
    return jsonError(
      cleanupError
        ? `Metadata lampiran gagal disimpan dan file sementara gagal dibersihkan: ${attachmentError.message}; ${cleanupError.message}`
        : `Metadata lampiran gagal disimpan: ${attachmentError.message}`,
      500,
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
