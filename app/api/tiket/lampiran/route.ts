import { NextResponse } from "next/server";
import { validateImageFile } from "@/lib/image-validation";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Form upload tidak valid." }, { status: 400 });
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
    return NextResponse.json(
      { error: "ID tiket atau file lampiran tidak valid." },
      { status: 400 },
    );
  }

  const validated = await validateImageFile(file);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("pembuat_id", user.id)
    .maybeSingle();

  if (ticketError) {
    console.error("Gagal memverifikasi kepemilikan tiket lampiran:", ticketError.message);
    return NextResponse.json(
      { error: "Gagal memverifikasi tiket." },
      { status: 500 },
    );
  }
  if (!ticket) {
    return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
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
    return NextResponse.json(
      { error: `Upload foto gagal: ${uploadError.message}` },
      { status: 502 },
    );
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
    return NextResponse.json(
      {
        error: cleanupError
          ? `Metadata lampiran gagal disimpan dan file sementara gagal dibersihkan: ${attachmentError.message}; ${cleanupError.message}`
          : `Metadata lampiran gagal disimpan: ${attachmentError.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
