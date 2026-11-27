import "server-only";

import { sendNotification, setVapidDetails } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type WebPushDispatchResult = {
  sent: number;
  skipped: number;
  removed: number;
  failures: string[];
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function getVapidPublicKey(): string | null {
  const key =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    "";
  return key || null;
}

function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  if (!publicKey || !privateKey) return null;

  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@it-service-desk.local";
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

function isPlaceholderOrInvalidSubscription(sub: PushSubscriptionRow): boolean {
  if (!sub.endpoint || !sub.endpoint.startsWith("https://")) return true;
  if (!sub.p256dh || sub.p256dh === "browser-local") return true;
  if (!sub.auth || sub.auth === "browser-local") return true;
  return false;
}

async function logWebPushDelivery(params: {
  ticketId?: string | null;
  notificationType: string;
  recipient: string;
  status: "sent" | "failed";
  errorMessage?: string | null;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("notification_logs").insert({
      ticket_id: params.ticketId ?? null,
      channel: "web_push",
      notification_type: params.notificationType,
      recipient: params.recipient.slice(0, 200),
      status: params.status,
      error_message: params.errorMessage ? params.errorMessage.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("Gagal mencatat log web push:", err);
  }
}

export async function sendWebPushToUser(params: {
  userId: string;
  ticketId?: string | null;
  notificationType: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<WebPushDispatchResult> {
  const config = getVapidConfig();
  if (!config) {
    return { sent: 0, skipped: 1, removed: 0, failures: [] };
  }

  let subscriptions: PushSubscriptionRow[] = [];
  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", params.userId);

    if (error) {
      return {
        sent: 0,
        skipped: 0,
        removed: 0,
        failures: [error.message],
      };
    }

    subscriptions = (data ?? []) as PushSubscriptionRow[];
  } catch (err) {
    return {
      sent: 0,
      skipped: 0,
      removed: 0,
      failures: [err instanceof Error ? err.message : "Gagal memuat langganan push."],
    };
  }

  if (subscriptions.length === 0) {
    return { sent: 0, skipped: 1, removed: 0, failures: [] };
  }

  try {
    setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch (err) {
    return {
      sent: 0,
      skipped: 0,
      removed: 0,
      failures: [
        err instanceof Error
          ? err.message
          : "Konfigurasi VAPID web push tidak valid.",
      ],
    };
  }

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    url: params.url ?? "/dashboard",
    tag: params.tag ?? params.notificationType,
  });

  let sent = 0;
  let skipped = 0;
  let removed = 0;
  const failures: string[] = [];

  for (const sub of subscriptions) {
    if (isPlaceholderOrInvalidSubscription(sub)) {
      skipped += 1;
      continue;
    }

    try {
      await sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
        },
      );
      sent += 1;
      await logWebPushDelivery({
        ticketId: params.ticketId,
        notificationType: params.notificationType,
        recipient: sub.endpoint,
        status: "sent",
      });
    } catch (err) {
      const statusCode =
        typeof err === "object" && err !== null && "statusCode" in err
          ? Number((err as { statusCode?: unknown }).statusCode)
          : undefined;
      const errMessage =
        err instanceof Error ? err.message : "Gagal mengirim notifikasi web push.";

      if (statusCode === 410 || statusCode === 404) {
        try {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          removed += 1;
        } catch (delErr) {
          console.error("Gagal menghapus subscription kedaluwarsa:", delErr);
        }
      }

      failures.push(errMessage);
      await logWebPushDelivery({
        ticketId: params.ticketId,
        notificationType: params.notificationType,
        recipient: sub.endpoint,
        status: "failed",
        errorMessage: errMessage,
      });
    }
  }

  return { sent, skipped, removed, failures };
}
