import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, kirimPesan } from "@/lib/telegram";

type NotificationType = "ticket_new" | "ticket_p0" | "ticket_done";
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
  for (const recipient of recipients) {
    const outcome = await sendOnce(
      ticketId,
      notificationType,
      recipient,
      message,
    );
    if (outcome === "sent") result.sent++;
    else if (outcome === "skipped") result.skipped++;
    else result.failures.push(`${recipient.nama}: ${outcome}`);
  }
  return result;
}

function buildTicketLink(ticketId: string, label: string) {
  const url = new URL(`/tiket/${encodeURIComponent(ticketId)}`, publicAppUrl());
  const safeUrl = escapeHtml(url.toString());
  return `<a href="${safeUrl}">${label}</a>`;
}

function compactDescription(description: string) {
  const compact = description.replace(/\s+/g, " ").trim().slice(0, 200);
  return escapeHtml(compact);
}

async function loadTicket(ticketId: string) {
  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select(
      "id, nomor_tiket, prioritas, deskripsi, penanganan, site_id, pembuat_id, category_id, status, tipe",
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
    admin
      .from("users")
      .select("id, nama, telegram_id")
      .eq("id", ticket.pembuat_id)
      .maybeSingle(),
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

export async function notifTiketBaru(ticketId: string) {
  const data = await loadTicket(ticketId);
  if (!data || data.ticket.status !== "baru") {
    throw new Error("Tiket baru tidak ditemukan atau statusnya sudah berubah.");
  }
  if (!data.ticket.site_id) {
    throw new Error("Tiket tidak memiliki site untuk routing notifikasi IT.");
  }

  const admin = createAdminClient();
  const { data: siteIts, error: siteItsError } = await admin
    .from("users")
    .select("id, nama, telegram_id")
    .eq("peran", "it")
    .eq("site_id", data.ticket.site_id)
    .not("telegram_id", "is", null);
  if (siteItsError) throw new Error(`Gagal mencari IT di site: ${siteItsError.message}`);

  const candidates = staffRecipients(siteIts);
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
  const targets = freeIts.length ? freeIts : candidates;
  const emoji = data.ticket.prioritas === "P0" ? "🚨" : "🎫";
  const message = `${emoji} <b>Tiket Baru ${escapeHtml(data.ticket.prioritas)}</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}
Site: ${escapeHtml(data.site?.nama ?? "-")}
Dari: ${escapeHtml(data.requester?.nama ?? "-")}
Penanganan: ${escapeHtml(data.ticket.penanganan)}

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
    data.ticket.prioritas !== "P0" ||
    data.ticket.tipe !== "insiden"
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

  const message = `🚨 <b>INSIDEN P0 BARU</b>
${escapeHtml(data.ticket.nomor_tiket)} — ${escapeHtml(data.category?.nama ?? "-")}
Site: ${escapeHtml(data.site?.nama ?? "-")}
Dari: ${escapeHtml(data.requester?.nama ?? "-")}

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

export async function notifTiketSelesai(ticketId: string) {
  const data = await loadTicket(ticketId);
  if (!data || data.ticket.status !== "selesai") {
    throw new Error("Tiket selesai tidak ditemukan atau belum berstatus selesai.");
  }
  const recipient = data.requester;
  if (!recipient?.telegram_id) return { sent: 0, skipped: 0, failures: [] };

  const chatId = telegramChatId(recipient.telegram_id);
  if (chatId === null) {
    throw new Error("ID Telegram pembuat tiket tidak valid.");
  }

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
