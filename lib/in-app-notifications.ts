import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, kirimPesan } from "@/lib/telegram";
import { sendWebPushToUser, type WebPushDispatchResult } from "@/lib/web-push";

export type DispatchUserNotificationParams = {
  userId: string;
  ticketId?: string | null;
  jenis: string;
  judul: string;
  pesan: string;
  tautan?: string | null;
  telegramId?: number | string | null;
  telegramHtml?: string | null;
  webPushPayload?: {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };
};

export type DispatchUserNotificationResult = {
  inApp: boolean;
  telegram: "sent" | "failed" | "skipped";
  webPush: WebPushDispatchResult;
};

function parseSafeTelegramChatId(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value !== 0 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed !== 0 ? parsed : null;
  }
  return null;
}

export async function dispatchUserNotification(
  params: DispatchUserNotificationParams,
): Promise<DispatchUserNotificationResult> {
  const admin = createAdminClient();
  let inApp = false;
  let telegram: "sent" | "failed" | "skipped" = "skipped";
  let webPush: WebPushDispatchResult = {
    sent: 0,
    skipped: 1,
    removed: 0,
    failures: [],
  };

  try {
    const { error } = await admin.from("in_app_notifications").insert({
      user_id: params.userId,
      ticket_id: params.ticketId ?? null,
      jenis: params.jenis.slice(0, 60),
      judul: params.judul.slice(0, 200),
      pesan: params.pesan.slice(0, 1000),
      tautan: params.tautan ?? null,
    });
    if (!error) {
      inApp = true;
    } else {
      console.error("Gagal menyimpan in_app_notifications:", error.message);
    }
  } catch (err) {
    console.error("Error in_app_notifications:", err);
  }

  const chatId = parseSafeTelegramChatId(params.telegramId);
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (chatId !== null && botToken) {
    const htmlMessage =
      params.telegramHtml?.trim() ||
      `<b>${escapeHtml(params.judul)}</b>\n${escapeHtml(params.pesan)}`;
    try {
      await kirimPesan(chatId, htmlMessage);
      telegram = "sent";
      try {
        await admin.from("notification_logs").insert({
          ticket_id: params.ticketId ?? null,
          channel: "telegram",
          notification_type: params.jenis,
          recipient: String(chatId),
          status: "sent",
        });
      } catch (logErr) {
        console.error("Gagal mencatat log telegram:", logErr);
      }
    } catch (err) {
      telegram = "failed";
      const errMsg = err instanceof Error ? err.message : "Gagal kirim Telegram.";
      try {
        await admin.from("notification_logs").insert({
          ticket_id: params.ticketId ?? null,
          channel: "telegram",
          notification_type: params.jenis,
          recipient: String(chatId),
          status: "failed",
          error_message: errMsg.slice(0, 500),
        });
      } catch (logErr) {
        console.error("Gagal mencatat log error telegram:", logErr);
      }
    }
  }

  try {
    webPush = await sendWebPushToUser({
      userId: params.userId,
      ticketId: params.ticketId ?? null,
      notificationType: params.jenis,
      title: params.webPushPayload?.title ?? params.judul,
      body: params.webPushPayload?.body ?? params.pesan,
      url: params.webPushPayload?.url ?? params.tautan ?? "/dashboard",
      tag: params.webPushPayload?.tag ?? params.jenis,
    });
  } catch (err) {
    console.error("Error dispatch web push:", err);
  }

  return { inApp, telegram, webPush };
}

export async function dispatchUsersNotification(
  items: DispatchUserNotificationParams[],
): Promise<DispatchUserNotificationResult[]> {
  if (items.length === 0) return [];
  const settled = await Promise.allSettled(
    items.map((item) => dispatchUserNotification(item)),
  );
  return settled.map((entry) =>
    entry.status === "fulfilled"
      ? entry.value
      : {
          inApp: false,
          telegram: "failed",
          webPush: { sent: 0, skipped: 0, removed: 0, failures: ["Dispatch rejected"] },
        },
  );
}
