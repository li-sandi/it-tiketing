import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { validateImageFile } from "@/lib/image-validation";
import { hitungPrioritas, parseAturanKenaikan } from "@/lib/prioritas";
import {
  checkPublicTicketRateLimit,
  resolveRateLimitNumbers,
} from "@/lib/rate-limit";
import { getRateLimitSetting } from "@/lib/settings";
import { prosesNotifikasiTiketBaru } from "@/lib/sleman";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_REQUEST_SIZE = 11 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
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
  uploadedPaths: string[],
) {
  const { error: deleteError } = await admin
    .from("tickets")
    .delete()
    .eq("id", ticketId);

  if (deleteError) {
    return `Tiket sementara ${ticketId} gagal dibatalkan: ${deleteError.message}`;
  }

  if (uploadedPaths.length) {
    const { error: removeError } = await admin.storage
      .from("ticket-attachments")
      .remove(uploadedPaths);
    if (removeError) {
      return `Tiket dibatalkan, tetapi file sementara gagal dibersihkan: ${removeError.message}`;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return jsonError("Ukuran permintaan maksimal 11 MB.", 413);
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
    "127.0.0.1";

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
  const jumlahTaskRaw = textField(formData, "jumlahTask");
  const nomorAset = textField(formData, "nomorAset");
  const penanganan = textField(formData, "penanganan");
  const anydeskId = textField(formData, "anydeskId");
  const anydeskPassword = textField(formData, "anydeskPassword");
  const uvId = textField(formData, "uvId");
  const uvPassword = textField(formData, "uvPassword");
  const rekomendasiUpgradeRam =
    textField(formData, "rekomendasiUpgradeRam") === "true";

  const fileValue = formData.get("file");
  if (fileValue instanceof File && fileValue.size === 0) {
    return jsonError("File lampiran kosong.", 400);
  }
  const file = fileValue instanceof File ? fileValue : null;

  const remoteFileValue = formData.get("remoteFile");
  if (remoteFileValue instanceof File && remoteFileValue.size === 0) {
    return jsonError("File foto remote kosong.", 400);
  }
  const remoteFile = remoteFileValue instanceof File ? remoteFileValue : null;

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
    uvId.length > 120 ||
    anydeskPassword.length > 200 ||
    uvPassword.length > 200
  ) {
    return jsonError("Nomor aset atau kredensial remote terlalu panjang.", 400);
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
  let jumlahTask: number | null = null;
  if (jumlahTaskRaw) {
    jumlahTask = Number(jumlahTaskRaw);
    if (
      !Number.isSafeInteger(jumlahTask) ||
      jumlahTask < 1 ||
      jumlahTask > 100_000
    ) {
      return jsonError("Jumlah task tidak valid.", 400);
    }
  }

  if (fileValue && !(fileValue instanceof File)) {
    return jsonError("Lampiran tidak valid.", 400);
  }
  if (remoteFileValue && !(remoteFileValue instanceof File)) {
    return jsonError("Lampiran foto remote tidak valid.", 400);
  }

  const admin = createAdminClient();
  const [
    { data: category, error: categoryError },
    { data: site, error: siteError },
    rateLimitSetting,
  ] = await Promise.all([
    admin
      .from("categories")
      .select(
        "id, nama, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote, stock_kode",
      )
      .eq("id", categoryId)
      .eq("aktif", true)
      .neq("tipe", "internal")
      .maybeSingle(),
    admin
      .from("sites")
      .select("id, jumlah_user, aktif")
      .eq("id", siteId)
      .maybeSingle(),
    getRateLimitSetting(),
  ]);

  if (categoryError) {
    console.error("Gagal memeriksa kategori tiket publik:", categoryError.message);
    return jsonError("Gagal memeriksa kategori tiket.", 500);
  }
  if (siteError) {
    console.error("Gagal memeriksa site tiket publik:", siteError.message);
    return jsonError("Gagal memeriksa site tiket.", 500);
  }
  if (!category || !site || !site.aktif) {
    if (!site || !site.aktif) return jsonError("Site tidak ditemukan atau tidak aktif.", 400);
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
    category.nama.startsWith("Internet lambat") ||
    category.nama.startsWith("Masalah VPN");
  if (needsAffectedUsers && jumlahUser === null) {
    return jsonError("Masukkan jumlah user terdampak (minimal 1).", 400);
  }
  if (rule?.tipe === "jumlah_task" && jumlahTask === null) {
    return jsonError("Masukkan jumlah task (minimal 1).", 400);
  }
  if (rule?.tipe !== "jumlah_task" && jumlahTask !== null) {
    return jsonError("Jumlah task tidak berlaku untuk kategori ini.", 400);
  }

  const prioritas = hitungPrioritas({
    prioritasDefault: category.prioritas_default,
    aturan: rule,
    jumlahUserTerdampak: jumlahUser ?? undefined,
    jumlahUserSite: site.jumlah_user,
    jumlahTaskVendor: jumlahTask ?? undefined,
  });

  // Rate limit check (general vs emergency P0 quota)
  const limits = resolveRateLimitNumbers({
    publicLimit: rateLimitSetting.public_limit,
    emergencyLimit: rateLimitSetting.emergency_limit,
    windowMinutes: rateLimitSetting.window_minutes,
  });
  const isEmergency = prioritas === "P0";
  try {
    const rateResult = await checkPublicTicketRateLimit({
      ip,
      bucket: isEmergency ? "emergency" : "general",
      limit: isEmergency ? limits.emergencyLimit : limits.publicLimit,
      windowMinutes: limits.windowMinutes,
    });

    if (!rateResult.success) {
      const secondsRemaining = Math.max(
        1,
        Math.ceil((rateResult.reset - Date.now()) / 1000),
      );
      console.warn(
        "Permintaan tiket publik ditolak oleh rate limit:",
        JSON.stringify({
          event: "public_ticket_rate_limited",
          bucket: isEmergency ? "emergency" : "general",
          limit: rateResult.limit,
          remaining: rateResult.remaining,
          retryAfterSeconds: secondsRemaining,
        }),
      );
      return NextResponse.json(
        {
          error: `Terlalu banyak permintaan. Coba lagi dalam ${Math.ceil(secondsRemaining / 60)} menit.`,
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "X-RateLimit-Limit": String(rateResult.limit),
            "X-RateLimit-Remaining": String(rateResult.remaining),
            "Retry-After": String(secondsRemaining),
          },
        },
      );
    }
  } catch (error) {
    console.error(
      "Rate limit tiket publik gagal:",
      error instanceof Error ? error.message : "Kesalahan rate limit.",
    );
    return jsonError("Layanan pengaman form sementara tidak tersedia.", 503);
  }

  let problemImageFormat: Awaited<ReturnType<typeof validateImageFile>> | null =
    null;
  if (file) {
    problemImageFormat = await validateImageFile(file);
    if (!problemImageFormat.ok) {
      return jsonError(problemImageFormat.error, 400);
    }
  }

  let remoteImageFormat: Awaited<ReturnType<typeof validateImageFile>> | null =
    null;
  if (remoteFile) {
    remoteImageFormat = await validateImageFile(remoteFile);
    if (!remoteImageFormat.ok) {
      return jsonError(`Foto remote tidak valid: ${remoteImageFormat.error}`, 400);
    }
  }

  let encryptedAnydeskPass: string | null = null;
  let encryptedUvPass: string | null = null;
  try {
    if (anydeskPassword) encryptedAnydeskPass = encryptSecret(anydeskPassword);
    if (uvPassword) encryptedUvPass = encryptSecret(uvPassword);
  } catch (err) {
    console.error("Gagal mengenkripsi password remote:", err);
    return jsonError(
      "Konfigurasi enkripsi kredensial remote belum tersedia.",
      500,
    );
  }

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
      jumlah_task: jumlahTask,
      nomor_aset: nomorAset || null,
      penanganan,
      rekomendasi_upgrade_ram: rekomendasiUpgradeRam,
    })
    .select("id, nomor_tiket, prioritas, status, estimasi_pengadaan, stock_kode")
    .single();

  if (insertError || !ticket) {
    console.error(
      "Gagal membuat tiket publik:",
      insertError?.message ?? "Respons tiket kosong.",
    );
    return jsonError("Gagal membuat tiket. Silakan coba lagi.", 500);
  }

  const uploadedPaths: string[] = [];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const credentials = [
    ...(anydeskId || encryptedAnydeskPass
      ? [
          {
            ticket_id: ticket.id,
            aplikasi: "anydesk",
            remote_id: anydeskId || "-",
            password_terenkripsi: encryptedAnydeskPass,
            kedaluwarsa_pada: encryptedAnydeskPass ? expiresAt : null,
          },
        ]
      : []),
    ...(uvId || encryptedUvPass
      ? [
          {
            ticket_id: ticket.id,
            aplikasi: "uv",
            remote_id: uvId || "-",
            password_terenkripsi: encryptedUvPass,
            kedaluwarsa_pada: encryptedUvPass ? expiresAt : null,
          },
        ]
      : []),
  ];

  if (credentials.length) {
    const { error: credentialError } = await admin
      .from("remote_credentials")
      .insert(credentials);
    if (credentialError) {
      const cleanupError = await rollbackTicket(admin, ticket.id, uploadedPaths);
      console.error("Gagal menyimpan kredensial remote:", credentialError.message);
      return jsonError(
        cleanupError
          ? `Gagal menyimpan kredensial remote dan membatalkan tiket: ${cleanupError}`
          : "Gagal menyimpan kredensial remote. Tiket tidak dibuat.",
        500,
      );
    }
  }

  const uploads: Array<{
    file: File;
    mimeType: string;
    extension: string;
    jenis: "foto" | "foto_remote";
  }> = [];
  if (file && problemImageFormat?.ok) {
    uploads.push({
      file,
      mimeType: problemImageFormat.format.mimeType,
      extension: problemImageFormat.format.extension,
      jenis: "foto",
    });
  }
  if (remoteFile && remoteImageFormat?.ok) {
    uploads.push({
      file: remoteFile,
      mimeType: remoteImageFormat.format.mimeType,
      extension: remoteImageFormat.format.extension,
      jenis: "foto_remote",
    });
  }

  for (const item of uploads) {
    const path = `tickets/${ticket.id}/${crypto.randomUUID()}.${item.extension}`;
    const { error: uploadError } = await admin.storage
      .from("ticket-attachments")
      .upload(path, item.file, {
        contentType: item.mimeType,
        upsert: false,
      });
    if (uploadError) {
      const cleanupError = await rollbackTicket(admin, ticket.id, uploadedPaths);
      console.error("Upload lampiran tiket publik gagal:", uploadError.message);
      return jsonError(
        cleanupError
          ? `Upload gagal dan tiket sementara gagal dibatalkan: ${cleanupError}`
          : "Upload foto gagal. Tiket tidak dibuat.",
        502,
      );
    }
    uploadedPaths.push(path);

    const { error: attachmentError } = await admin.from("attachments").insert({
      ticket_id: ticket.id,
      path_file: path,
      jenis: item.jenis,
    });
    if (attachmentError) {
      const cleanupError = await rollbackTicket(admin, ticket.id, uploadedPaths);
      console.error("Metadata lampiran publik gagal disimpan:", attachmentError.message);
      return jsonError(
        cleanupError
          ? `Gagal menyimpan lampiran dan membersihkan tiket: ${cleanupError}`
          : "Gagal menyimpan lampiran. Tiket tidak dibuat.",
        500,
      );
    }
  }

  const { warnings, kunjungan } = await prosesNotifikasiTiketBaru(ticket.id);
  if (warnings.length) {
    console.error("Notifikasi tiket publik gagal:", warnings.join("; "));
  }

  return NextResponse.json(
    {
      ok: true,
      id: ticket.id,
      nomorTiket: ticket.nomor_tiket,
      prioritas: ticket.prioritas,
      status: ticket.status,
      estimasiPengadaan: ticket.estimasi_pengadaan,
      stockKode: ticket.stock_kode,
      token: accessToken,
      kunjungan,
      warnings,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
