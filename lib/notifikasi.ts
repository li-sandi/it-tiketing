import "server-only";

import { sendNotificationEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, kirimPesan } from "@/lib/telegram";

export type NotificationType =
  | "ticket_new"
  | "ticket_p0"
  | "ticket_done"
  | "sla_respon_mendekati"
  | "sla_respon_lewat"
  | "sla_resolusi_mendekati"
  | "sla_resolusi_lewat"
  | "sla_aging"
  | "auto_close"
  | "kunjungan_sleman"
  | "kunjungan_sleman_reminder"
  | "ticket_merged"
  | "approval_needed"
  | "approval_decided"
  | "weekly_report"
  | "schedule_expiry";

type Recipient = {
  id: string;
  nama: string;
  telegram_id: string;
};
type DeliveryResult = {
  sent: number;
  skipped: number;
  failures: string[];
};

function publicAppUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("NEXT_PUBLIC_APP_URL harus berupa URL HTTP(S) yang valid.");
  }
  return url.origin;
}

function telegramChatId(value: string) {
  const chatId = Number(value);
  if (!Number.isSafeInteger(chatId)) return null;
  return chatId;
}

async function sendOnce(
  ticketId: string,
  notificationType: NotificationType,
  recipient: Recipient,
  message: string,
): Promise<"sent" | "skipped" | string> {
  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_telegram_notification",
    {
      p_ticket_id: ticketId,
      p_notification_type: notificationType,
      p_recipient_chat_id: recipient.telegram_id,
    },
  );
  if (claimError) return `Gagal mengunci notifikasi: ${claimError.message}`;
  if (!claimed) return "skipped";

  const chatId = telegramChatId(recipient.telegram_id);
  if (chatId === null) {
    const errorMessage = "ID chat Telegram bukan angka yang valid.";
    const { error } = await admin.rpc("finish_telegram_notification", {
      p_ticket_id: ticketId,
      p_notification_type: notificationType,
      p_recipient_chat_id: recipient.telegram_id,
      p_sent: false,
      p_error: errorMessage,
    });
    return error ? `${errorMessage} Gagal mencatat hasil: ${error.message}` : errorMessage;
  }

  try {
    await kirimPesan(chatId, message);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Pengiriman Telegram gagal.";
    const { error: finishError } = await admin.rpc(
      "finish_telegram_notification",
      {
        p_ticket_id: ticketId,
        p_notification_type: notificationType,
        p_recipient_chat_id: recipient.telegram_id,
        p_sent: false,
        p_error: messageText,
      },
    );
    return finishError
      ? `${messageText} Gagal mencatat hasil: ${finishError.message}`
      : messageText;
  }

  const { data: finished, error: finishError } = await admin.rpc(
    "finish_telegram_notification",
    {
      p_ticket_id: ticketId,
      p_notification_type: notificationType,
      p_recipient_chat_id: recipient.telegram_id,
      p_sent: true,
    },
  );
  if (finishError || !finished) {
    return `Pesan terkirim tetapi status delivery gagal disimpan${finishError ? `: ${finishError.message}` : "."}`;
  }
  return "sent";
}

async function deliver(
  ticketId: string,
  notificationType: NotificationType,
  recipients: Recipient[],
  message: string,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, skipped: 0, failures: [] };
  const outcomes = await Promise.allSettled(
    recipients.map((recipient) =>
      sendOnce(ticketId, notificationType, recipient, message),
    ),
  );
  outcomes.forEach((entry, index) => {
    const recipient = recipients[index];
    if (entry.status === "rejected") {
      result.failures.push(
        `${recipient.nama}: ${entry.reason instanceof Error ? entry.reason.message : "Gagal kirim"}`,
      );
      return;
    }
    if (entry.value === "sent") result.sent++;
    else if (entry.value === "skipped") result.skipped++;
    else result.failures.push(`${recipient.nama}: ${entry.value}`);
  });
  return result;
}

export function buildTicketLink(ticketId: string, label: string) {
  const url = new URL(`/tiket/${encodeURIComponent(ticketId)}`, publicAppUrl());
  const safeUrl = escapeHtml(url.toString());
  return `<a href="${safeUrl}">${label}</a>`;
}

export function compactDescription(description: string) {
  const compact = description.replace(/\s+/g, " ").trim().slice(0, 200);
  return escapeHtml(compact);
}

async function loadTicket(ticketId: string) {
  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select(
      "id, nomor_tiket, prioritas, deskripsi, penanganan, site_id, it_id, sla_resolusi_batas, pembuat_id, pembuat_nama, pembuat_kontak, akses_token, category_id, status, tipe, approval_status, estimasi_pengadaan, stock_kode",
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError) throw new Error(`Gagal membaca tiket: ${ticketError.message}`);
  if (!ticket) return null;

  const [
    { data: category, error: categoryError },
    { data: site, error: siteError },
    { data: requester, error: requesterError },
  ] = await Promise.all([
    admin.from("categories").select("nama").eq("id", ticket.category_id).maybeSingle(),
    ticket.site_id
      ? admin.from("sites").select("nama").eq("id", ticket.site_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ticket.pembuat_id
      ? admin
          .from("users")
          .select("id, nama, email, telegram_id")
          .eq("id", ticket.pembuat_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (categoryError) throw new Error(`Gagal membaca kategori: ${categoryError.message}`);
  if (siteError) throw new Error(`Gagal membaca site: ${siteError.message}`);
  if (requesterError) throw new Error(`Gagal membaca pembuat tiket: ${requesterError.message}`);

  return { ticket, category, site, requester };
}

function staffRecipients(
  rows: Array<{ id: string; nama: string; telegram_id: string | null }> | null,
): Recipient[] {
  return (rows ?? [])
    .filter(
      (row): row is { id: string; nama: string; telegram_id: string } =>
        typeof row.telegram_id === "string" && row.telegram_id.length > 0,
    )
    .map(({ id, nama, telegram_id }) => ({ id, nama, telegram_id }));
}

function formatFailures(result: DeliveryResult) {
  if (!result.failures.length) return null;
  return result.failures.join("; ");
}

function extractEmailRecipient(
  requester: { email?: string | null } | null,
  kontak: string | null,
): string | null {
  if (requester?.email && requester.email.includes("@")) {
    return requester.email;
  }
  if (kontak && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kontak.trim())) {
    return kontak.trim();
  }
  return null;
}

export async function notifTiketBaru(ticketId: string) {
  const data = await loadTicket(ticketId);
  if (
    !data ||
    (data.ticket.status !== "baru" &&
      data.ticket.status !== "menunggu_pengadaan")
  ) {
    throw new Error("Tiket baru tidak ditemukan atau statusnya sudah berubah.");
  }
  if (!data.ticket.site_id) {
    throw new Error("Tiket tidak memiliki site untuk routing notifikasi IT.");
  }

  const admin = createAdminClient();
  let assignedName: string | null = null;
  let targets: Recipient[];
  if (data.ticket.it_id) {
    const { data: assignedIt, error: assignedItError } = await admin
      .from("users")
      .select("id, nama, telegram_id")
      .eq("id", data.ticket.it_id)
      .eq("peran", "it")
      .maybeSingle();
    if (assignedItError) {
      throw new Error(`Gagal mencari IT petugas jadwal: ${assignedItError.message}`);
    }
    if (!assignedIt) {
      throw new Error("IT yang ditugaskan ke tiket tidak ditemukan.");
    }
    assignedName = assignedIt.nama;
    targets = staffRecipients([assignedIt]);
    if (!targets.length) {
      throw new Error(
        `IT petugas jadwal ${assignedIt.nama} belum menghubungkan Telegram.`,
      );
    }
  } else {
    let siteItsQuery = admin
      .from("users")
      .select("id, nama, telegram_id")
      .eq("peran", "it")
      .not("telegram_id", "is", null);
    if (data.site?.nama !== "Sleman") {
      siteItsQuery = siteItsQuery.eq("site_id", data.ticket.site_id);
    }
    const { data: siteIts, error: siteItsError } = await siteItsQuery;
    if (siteItsError) {
      throw new Error(`Gagal mencari IT penerima tiket: ${siteItsError.message}`);
    }

    let candidates = staffRecipients(siteIts);
    if (!candidates.length) {
      const { data: allIts, error: allItsError } = await admin
        .from("users")
        .select("id, nama, telegram_id")
        .eq("peran", "it")
        .not("telegram_id", "is", null);
      if (allItsError) {
        throw new Error(`Gagal mencari IT pengganti: ${allItsError.message}`);
      }
      candidates = staffRecipients(allIts);
    }
    const { data: freeStatuses, error: statusError } = candidates.length
      ? await admin
          .from("it_status")
          .select("it_id")
          .in(
            "it_id",
            candidates.map((recipient) => recipient.id),
          )
          .eq("status", "free")
      : { data: [], error: null };
    if (statusError) {
      throw new Error(`Gagal memeriksa status IT: ${statusError.message}`);
    }

    const freeIds = new Set((freeStatuses ?? []).map((status) => status.it_id));
    const freeIts = candidates.filter((recipient) => freeIds.has(recipient.id));
    targets = freeIts.length ? freeIts : candidates;
  }

  const emoji = data.ticket.prioritas === "P0" ? "🚨" : "🎫";
  const resolutionDeadline = data.ticket.sla_resolusi_batas
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(data.ticket.sla_resolusi_batas))
    : null;
  const deadlineLine =
    data.site?.nama === "Sleman" &&
    data.ticket.it_id &&
    data.ticket.prioritas === "P1" &&
    resolutionDeadline
      ? `\nBatas resolusi hari ini: ${escapeHtml(resolutionDeadline)}`
      : "";
  const assignmentLine = assignedName
    ? `Petugas kunjungan: ${escapeHtml(assignedName)}`
    : "";
  const procurementLine =
    data.ticket.status === "menunggu_pengadaan"
      ? `\n📦 <b>Stok sparepart (${escapeHtml(data.ticket.stock_kode ?? "-")}) habis</b> — status otomatis Menunggu Pengadaan (estimasi: ${escapeHtml(data.ticket.estimasi_pengadaan ?? "bulan depan")}).`
      : "";
  const message = `${emoji} <b>Tiket Baru ${escapeHtml(data.ticket.prioritas)}</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}
Site: ${escapeHtml(data.site?.nama ?? "-")}
${assignmentLine}
Dari: ${escapeHtml(data.requester?.nama ?? data.ticket.pembuat_nama ?? "-")}
Penanganan: ${escapeHtml(data.ticket.penanganan)}
${deadlineLine}${procurementLine}

${compactDescription(data.ticket.deskripsi)}

${buildTicketLink(ticketId, "Buka tiket →")}`;

  const result = await deliver(ticketId, "ticket_new", targets, message);
  const failures = formatFailures(result);
  if (failures) throw new Error(`Sebagian notifikasi tiket baru gagal: ${failures}`);
  return result;
}

export async function notifP0Broadcast(ticketId: string) {
  const data = await loadTicket(ticketId);
  if (
    !data ||
    data.ticket.status !== "baru" ||
    data.ticket.prioritas !== "P0"
  ) {
    return { sent: 0, skipped: 0, failures: [] } satisfies DeliveryResult;
  }

  const admin = createAdminClient();
  const { data: allIts, error } = await admin
    .from("users")
    .select("id, nama, telegram_id")
    .eq("peran", "it")
    .not("telegram_id", "is", null);
  if (error) throw new Error(`Gagal mencari penerima broadcast P0: ${error.message}`);

  const message = `🚨 <b>TIKET PRIORITAS P0 BARU</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}
Site: ${escapeHtml(data.site?.nama ?? "-")}
Dari: ${escapeHtml(data.requester?.nama ?? data.ticket.pembuat_nama ?? "-")}

${compactDescription(data.ticket.deskripsi)}

${buildTicketLink(ticketId, "Tangani sekarang →")}`;

  const result = await deliver(
    ticketId,
    "ticket_p0",
    staffRecipients(allIts),
    message,
  );
  const failures = formatFailures(result);
  if (failures) throw new Error(`Sebagian broadcast P0 gagal: ${failures}`);
  return result;
}

export async function notifyTicketRecipients(
  ticketId: string,
  notificationType: NotificationType,
  recipients: Recipient[],
  message: string,
) {
  const result = await deliver(ticketId, notificationType, recipients, message);
  const failures = formatFailures(result);
  if (failures) {
    throw new Error(`Notifikasi ${notificationType} gagal: ${failures}`);
  }
  return result;
}

export async function notifSlaAging(
  ticketId: string,
  oldPriority: string,
  newPriority: string,
) {
  const data = await loadTicket(ticketId);
  if (!data) return { sent: 0, skipped: 0, failures: [] } satisfies DeliveryResult;

  const admin = createAdminClient();
  const { data: allIts, error } = await admin
    .from("users")
    .select("id, nama, telegram_id")
    .eq("peran", "it")
    .not("telegram_id", "is", null);
  if (error) throw new Error(`Gagal mencari IT untuk notifikasi aging: ${error.message}`);

  const message = `⬆️ <b>Prioritas Tiket Naik Otomatis (Aging)</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}
Prioritas: <b>${escapeHtml(oldPriority)} → ${escapeHtml(newPriority)}</b>
Site: ${escapeHtml(data.site?.nama ?? "-")}

${compactDescription(data.ticket.deskripsi)}

${buildTicketLink(ticketId, "Ambil tiket →")}`;

  return deliver(ticketId, "sla_aging", staffRecipients(allIts), message);
}

export async function notifTiketSelesai(ticketId: string) {
  const data = await loadTicket(ticketId);
  if (!data || data.ticket.status !== "selesai") {
    throw new Error("Tiket selesai tidak ditemukan atau belum berstatus selesai.");
  }

  const emailTo = extractEmailRecipient(data.requester, data.ticket.pembuat_kontak);
  if (emailTo) {
    const linkPath = data.ticket.pembuat_id
      ? `/tiket/${encodeURIComponent(ticketId)}`
      : data.ticket.akses_token
        ? `/status/${encodeURIComponent(data.ticket.akses_token)}`
        : "/";
    const linkUrl = new URL(linkPath, publicAppUrl()).toString();
    await sendNotificationEmail({
      ticketId,
      notificationType: "ticket_done",
      to: emailTo,
      subject: `[IT Ticketing] Tiket ${data.ticket.nomor_tiket} Selesai`,
      html: `<p>Tiket <strong>${escapeHtml(data.ticket.nomor_tiket)}</strong> (${escapeHtml(data.category?.nama ?? "-")}) telah selesai ditangani.</p><p>Silakan konfirmasi dan beri rating melalui tautan berikut:</p><p><a href="${escapeHtml(linkUrl)}">${escapeHtml(linkUrl)}</a></p>`,
    });
  }

  const recipient = data.requester;
  if (!recipient?.telegram_id) return { sent: 0, skipped: 0, failures: [] };

  const message = `✅ <b>Tiket Selesai</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}

Tiket kamu sudah selesai. Silakan cek dashboard untuk konfirmasi &amp; rating.

${buildTicketLink(ticketId, "Lihat tiket →")}`;

  const result = await deliver(
    ticketId,
    "ticket_done",
    [{ id: recipient.id, nama: recipient.nama, telegram_id: recipient.telegram_id }],
    message,
  );
  const failures = formatFailures(result);
  if (failures) throw new Error(`Notifikasi tiket selesai gagal: ${failures}`);
  return result;
}

export async function notifTiketDitutupOtomatis(ticketId: string) {
  const data = await loadTicket(ticketId);
  if (!data || data.ticket.status !== "ditutup") {
    return { sent: 0, skipped: 0, failures: [] };
  }

  const emailTo = extractEmailRecipient(data.requester, data.ticket.pembuat_kontak);
  if (emailTo) {
    await sendNotificationEmail({
      ticketId,
      notificationType: "auto_close",
      to: emailTo,
      subject: `[IT Ticketing] Tiket ${data.ticket.nomor_tiket} Ditutup Otomatis`,
      html: `<p>Tiket <strong>${escapeHtml(data.ticket.nomor_tiket)}</strong> telah ditutup otomatis karena melewati batas waktu konfirmasi sesuai target SLA resolusi.</p>`,
    });
  }

  const recipient = data.requester;
  if (!recipient?.telegram_id) return { sent: 0, skipped: 0, failures: [] };

  const message = `ℹ️ <b>Tiket Ditutup Otomatis</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}

Tiket kamu sudah ditutup otomatis karena belum ada konfirmasi dalam jangka waktu SLA resolusi.

${buildTicketLink(ticketId, "Lihat tiket →")}`;

  const result = await deliver(
    ticketId,
    "auto_close",
    [{ id: recipient.id, nama: recipient.nama, telegram_id: recipient.telegram_id }],
    message,
  );
  const failures = formatFailures(result);
  if (failures) throw new Error(`Notifikasi auto-close gagal: ${failures}`);
  return result;
}

export async function notifTiketDigabung(
  childTicketIds: string[],
  parentTicketNumber: string,
) {
  for (const childId of childTicketIds) {
    try {
      const data = await loadTicket(childId);
      if (!data?.requester?.telegram_id) continue;
      const message = `🔗 <b>Tiket Digabungkan</b>
${escapeHtml(data.ticket.nomor_tiket)} digabungkan ke tiket induk <b>${escapeHtml(parentTicketNumber)}</b> agar ditangani bersama.

${buildTicketLink(childId, "Lihat tiket →")}`;
      await deliver(
        childId,
        "ticket_merged",
        [
          {
            id: data.requester.id,
            nama: data.requester.nama,
            telegram_id: data.requester.telegram_id,
          },
        ],
        message,
      );
    } catch (err) {
      console.error(`Gagal kirim notif merge untuk ${childId}:`, err);
    }
  }
}

export async function notifApprovalDiperlukan(ticketId: string) {
  const data = await loadTicket(ticketId);
  if (!data || data.ticket.approval_status !== "menunggu") {
    return { sent: 0, skipped: 0, failures: [] } satisfies DeliveryResult;
  }

  const admin = createAdminClient();
  const { data: approvers } = await admin
    .from("users")
    .select("id, nama, telegram_id, email")
    .in("peran", ["ga", "admin"]);

  const tgRecipients = staffRecipients(approvers ?? []);
  const stockInfoLine =
    data.ticket.status === "menunggu_pengadaan"
      ? `\n📦 Stok <b>${escapeHtml(data.ticket.stock_kode ?? "sparepart")}</b> kosong (0). Estimasi pengadaan: <b>${escapeHtml(data.ticket.estimasi_pengadaan ?? "bulan depan")}</b>.`
      : "";
  const message = `📝 <b>Persetujuan GA/Admin Diperlukan</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}
Pemohon: ${escapeHtml(data.requester?.nama ?? data.ticket.pembuat_nama ?? "-")}${stockInfoLine}

${compactDescription(data.ticket.deskripsi)}

${buildTicketLink(ticketId, "Tinjau persetujuan →")}`;

  for (const approver of approvers ?? []) {
    if (approver.email) {
      await sendNotificationEmail({
        ticketId,
        notificationType: "approval_needed",
        to: approver.email,
        subject: `[IT Ticketing] Approval Diperlukan: ${data.ticket.nomor_tiket}`,
        html: `<p>Tiket <strong>${escapeHtml(data.ticket.nomor_tiket)}</strong> (${escapeHtml(data.category?.nama ?? "-")}) menunggu persetujuan GA/Admin.</p>`,
      });
    }
  }

  if (!tgRecipients.length) return { sent: 0, skipped: 0, failures: [] };
  return deliver(ticketId, "approval_needed", tgRecipients, message);
}

export async function notifApprovalKeputusan(
  ticketId: string,
  keputusan: "disetujui" | "ditolak",
  catatan: string,
) {
  const data = await loadTicket(ticketId);
  if (!data) return { sent: 0, skipped: 0, failures: [] } satisfies DeliveryResult;

  const recipients: Recipient[] = [];
  if (data.requester?.telegram_id) {
    recipients.push({
      id: data.requester.id,
      nama: data.requester.nama,
      telegram_id: data.requester.telegram_id,
    });
  }
  if (data.ticket.it_id) {
    const admin = createAdminClient();
    const { data: itUser } = await admin
      .from("users")
      .select("id, nama, telegram_id")
      .eq("id", data.ticket.it_id)
      .maybeSingle();
    if (itUser?.telegram_id) {
      recipients.push({
        id: itUser.id,
        nama: itUser.nama,
        telegram_id: itUser.telegram_id,
      });
    }
  }

  if (!recipients.length) return { sent: 0, skipped: 0, failures: [] };
  const label = keputusan === "disetujui" ? "DISETUJUI ✅" : "DITOLAK ❌";
  const noteLine = catatan ? `\nCatatan: ${escapeHtml(catatan)}` : "";
  const message = `📋 <b>Keputusan Approval: ${label}</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}${noteLine}

${buildTicketLink(ticketId, "Lihat detail →")}`;

  return deliver(ticketId, "approval_decided", recipients, message);
}
