import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifP0Broadcast, notifTiketBaru } from "@/lib/notifikasi";
import { hitungPrioritas, parseAturanKenaikan } from "@/lib/prioritas";

// Per-process best-effort limit; replace with a shared store before deployment.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = 6 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
      ["GIF87a", "GIF89a"].includes(
        String.fromCharCode(...bytes.subarray(0, 6)),
      ),
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

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now >= record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (record.count >= RATE_LIMIT) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }

  record.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function textField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isPriority(value: string): value is "P0" | "P1" | "P2" | "P3" {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3";
}

async function rollbackTicket(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string,
  uploadedPath: string | null,
) {
  const { error: deleteError } = await admin
    .from("tickets")
    .delete()
    .eq("id", ticketId);

  if (deleteError) {
    return `Tiket sementara ${ticketId} gagal dibatalkan: ${deleteError.message}`;
  }

  if (uploadedPath) {
    const { error: removeError } = await admin.storage
      .from("ticket-attachments")
      .remove([uploadedPath]);
    if (removeError) {
      return `Tiket dibatalkan, tetapi file sementara gagal dibersihkan: ${removeError.message}`;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return jsonError("Ukuran permintaan maksimal 6 MB.", 413);
  }

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

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-ip";
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan. Silakan coba lagi dalam 15 menit.",
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfter),
        },
      },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Data form tidak valid.", 400);
  }

  if (textField(formData, "website")) {
    return jsonError("Permintaan tidak valid.", 400);
  }

  const nama = textField(formData, "nama");
  const kontak = textField(formData, "kontak");
  const siteId = textField(formData, "siteId");
  const categoryId = textField(formData, "categoryId");
  const deskripsi = textField(formData, "deskripsi");
  const jumlahUserRaw = textField(formData, "jumlahUser");
  const nomorAset = textField(formData, "nomorAset");
  const penanganan = textField(formData, "penanganan");
  const anydeskId = textField(formData, "anydeskId");
  const uvId = textField(formData, "uvId");
  const fileValue = formData.get("file");
  if (fileValue instanceof File && fileValue.size === 0) {
    return jsonError("File lampiran kosong.", 400);
  }
  const file =
    fileValue instanceof File ? fileValue : null;

  if (nama.length < 2 || nama.length > 120) {
    return jsonError("Nama harus berisi 2 sampai 120 karakter.", 400);
  }
  if (kontak.length > 200) {
    return jsonError("Kontak maksimal 200 karakter.", 400);
  }
  if (!UUID_PATTERN.test(siteId) || !UUID_PATTERN.test(categoryId)) {
    return jsonError("Site atau kategori tidak valid.", 400);
  }
  if (deskripsi.length < 5 || deskripsi.length > 5000) {
    return jsonError("Deskripsi harus berisi 5 sampai 5000 karakter.", 400);
  }
  if (
    nomorAset.length > 120 ||
    anydeskId.length > 120 ||
    uvId.length > 120
  ) {
    return jsonError("Nomor aset atau ID remote terlalu panjang.", 400);
  }
  if (penanganan !== "remote" && penanganan !== "onsite") {
    return jsonError("Pilihan penanganan tidak valid.", 400);
  }

  let jumlahUser: number | null = null;
  if (jumlahUserRaw) {
    jumlahUser = Number(jumlahUserRaw);
    if (
      !Number.isSafeInteger(jumlahUser) ||
      jumlahUser < 1 ||
      jumlahUser > 1_000_000
    ) {
      return jsonError("Jumlah user terdampak tidak valid.", 400);
    }
  }

  if (fileValue && !(fileValue instanceof File)) {
    return jsonError("Lampiran tidak valid.", 400);
  }
  if (file && file.size > MAX_FILE_SIZE) {
    return jsonError("Ukuran file maksimal 5 MB.", 400);
  }

  const admin = createAdminClient();
  const [
    { data: category, error: categoryError },
    { data: site, error: siteError },
  ] = await Promise.all([
    admin
      .from("categories")
      .select(
        "id, nama, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote",
      )
      .eq("id", categoryId)
      .eq("aktif", true)
      .maybeSingle(),
    admin.from("sites").select("id, jumlah_user").eq("id", siteId).maybeSingle(),
  ]);

  if (categoryError) {
    console.error("Gagal memeriksa kategori tiket publik:", categoryError.message);
    return jsonError("Gagal memeriksa kategori tiket.", 500);
  }
  if (siteError) {
    console.error("Gagal memeriksa site tiket publik:", siteError.message);
    return jsonError("Gagal memeriksa site tiket.", 500);
  }
  if (!category || !site) {
    console.warn("Lookup referensi tiket publik tidak menemukan baris.", {
      siteId,
      categoryId,
      siteFound: Boolean(site),
      categoryFound: Boolean(category),
    });
    if (!site) return jsonError("Site tidak ditemukan.", 400);
    return jsonError("Kategori tidak ditemukan atau tidak aktif.", 400);
  }
  if (!isPriority(category.prioritas_default)) {
    console.error("Kategori memiliki prioritas default tidak valid:", categoryId);
    return jsonError("Konfigurasi kategori tidak valid.", 500);
  }
  if (category.butuh_aset && !nomorAset) {
    return jsonError("Kategori ini mewajibkan nomor aset.", 400);
  }
  if (category.butuh_foto && !file) {
    return jsonError("Kategori ini wajib melampirkan foto.", 400);
  }
  if (penanganan === "remote" && !category.bisa_remote) {
    return jsonError("Kategori ini tidak mendukung penanganan remote.", 400);
  }
  const rule = parseAturanKenaikan(category.prioritas_naik);
  const needsAffectedUsers =
    rule?.tipe === "persen_site" ||
    rule?.tipe === "jumlah_user" ||
    ["Internet lambat", "Masalah VPN", "Aktivasi / non-aktivasi VPN"].includes(
      category.nama,
    );
  if (needsAffectedUsers && jumlahUser === null) {
    return jsonError("Masukkan jumlah user terdampak (minimal 1).", 400);
  }

  let imageFormat: (typeof IMAGE_FORMATS)[number] | null = null;
  if (file) {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    imageFormat =
      IMAGE_FORMATS.find(
        (format) =>
          format.mimeType === file.type && format.matches(header),
      ) ?? null;
    if (!imageFormat) {
      return jsonError(
        "File harus berupa gambar JPEG, PNG, WebP, atau GIF yang valid.",
        400,
      );
    }
  }

  const prioritas = hitungPrioritas({
    prioritasDefault: category.prioritas_default,
    aturan: rule,
    jumlahUserTerdampak: jumlahUser ?? undefined,
    jumlahUserSite: site.jumlah_user,
  });
  const accessToken = crypto.randomUUID();
  const { data: ticket, error: insertError } = await admin
    .from("tickets")
    .insert({
      pembuat_id: null,
      pembuat_nama: nama,
      pembuat_kontak: kontak || null,
      akses_token: accessToken,
      site_id: site.id,
      category_id: category.id,
      tipe: category.tipe,
      deskripsi,
      prioritas,
      jumlah_user_terdampak: jumlahUser,
      nomor_aset: nomorAset || null,
      penanganan,
    })
    .select("id, nomor_tiket")
    .single();

  if (insertError || !ticket) {
    console.error(
      "Gagal membuat tiket publik:",
      insertError?.message ?? "Respons tiket kosong.",
    );
    return jsonError("Gagal membuat tiket. Silakan coba lagi.", 500);
  }

  let uploadedPath: string | null = null;

  const credentials = [
    ...(anydeskId
      ? [{ ticket_id: ticket.id, aplikasi: "anydesk", remote_id: anydeskId }]
      : []),
    ...(uvId
      ? [{ ticket_id: ticket.id, aplikasi: "uv", remote_id: uvId }]
      : []),
  ];
  if (credentials.length) {
    const { error: credentialError } = await admin
      .from("remote_credentials")
      .insert(credentials);
    if (credentialError) {
      const cleanupError = await rollbackTicket(admin, ticket.id, null);
      console.error(
        "Gagal menyimpan ID remote tiket publik:",
        credentialError.message,
      );
      return jsonError(
        cleanupError
          ? `Gagal menyimpan ID remote dan membatalkan tiket: ${cleanupError}`
          : "Gagal menyimpan ID remote. Tiket tidak dibuat.",
        500,
      );
    }
  }

  if (file && imageFormat) {
    const path = `tickets/${ticket.id}/${crypto.randomUUID()}.${imageFormat.extension}`;
    const { error: uploadError } = await admin.storage
      .from("ticket-attachments")
      .upload(path, file, {
        contentType: imageFormat.mimeType,
        upsert: false,
      });
    if (uploadError) {
      const cleanupError = await rollbackTicket(admin, ticket.id, null);
      console.error("Upload lampiran tiket publik gagal:", uploadError.message);
      return jsonError(
        cleanupError
          ? `Upload gagal dan tiket sementara gagal dibatalkan: ${cleanupError}`
          : "Upload foto gagal. Tiket tidak dibuat.",
        502,
      );
    }
    uploadedPath = path;

    const { error: attachmentError } = await admin.from("attachments").insert({
      ticket_id: ticket.id,
      path_file: path,
      jenis: "foto",
    });
    if (attachmentError) {
      const cleanupError = await rollbackTicket(admin, ticket.id, uploadedPath);
      console.error("Metadata lampiran publik gagal disimpan:", attachmentError.message);
      return jsonError(
        cleanupError
          ? `Gagal menyimpan lampiran dan membersihkan tiket: ${cleanupError}`
          : "Gagal menyimpan lampiran. Tiket tidak dibuat.",
        500,
      );
    }
  }

  const notificationResults = await Promise.allSettled([
    notifTiketBaru(ticket.id),
    notifP0Broadcast(ticket.id),
  ]);
  const warnings = notificationResults.flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : "Notifikasi Telegram gagal dikirim.",
        ]
      : [],
  );
  if (warnings.length) {
    console.error("Notifikasi tiket publik gagal:", warnings.join("; "));
  }

  return NextResponse.json(
    {
      ok: true,
      id: ticket.id,
      nomorTiket: ticket.nomor_tiket,
      token: accessToken,
      warnings,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
