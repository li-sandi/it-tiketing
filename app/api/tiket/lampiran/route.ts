import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMAGE_FORMATS = [
  {
    mimeType: "image/jpeg",
    extension: "jpg",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  {
    mimeType: "image/png",
    extension: "png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  {
    mimeType: "image/gif",
    extension: "gif",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 6 &&
      String.fromCharCode(...bytes.subarray(0, 6)) in
        { GIF87a: true, GIF89a: true },
  },
  {
    mimeType: "image/webp",
    extension: "webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP",
  },
] as const;

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

  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Ukuran file harus lebih dari 0 dan maksimal 5 MB." },
      { status: 400 },
    );
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

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const format = IMAGE_FORMATS.find((candidate) => candidate.matches(header));
  if (!format || file.type !== format.mimeType) {
    return NextResponse.json(
      { error: "File harus berupa gambar JPEG, PNG, WebP, atau GIF yang valid." },
      { status: 400 },
    );
  }

  const path = `tickets/${ticketId}/${crypto.randomUUID()}.${format.extension}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("ticket-attachments")
    .upload(path, file, {
      contentType: format.mimeType,
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
    jenis: "foto",
  });

  if (attachmentError) {
    const { error: cleanupError } = await admin.storage
      .from("ticket-attachments")
      .remove([path]);
    console.error("Metadata lampiran gagal disimpan:", attachmentError.message);
    if (cleanupError) {
      console.error("Gagal membersihkan file tanpa metadata:", cleanupError.message);
    }
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
