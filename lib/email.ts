import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function sendNotificationEmail(params: {
  ticketId?: string | null;
  notificationType: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();

  if (!params.to || (!resendKey && !webhookUrl)) {
    return { sent: false, skipped: true };
  }

  const admin = createAdminClient();
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;

  try {
    if (resendKey && emailFrom) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [params.to],
          subject: params.subject,
          html: params.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Resend HTTP ${response.status}`);
      }
    } else if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: params.to,
          subject: params.subject,
          html: params.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Email webhook HTTP ${response.status}`);
      }
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : "Pengiriman email gagal.";
  }

  await admin.from("notification_logs").insert({
    ticket_id: params.ticketId ?? null,
    channel: "email",
    notification_type: params.notificationType,
    recipient: params.to,
    status,
    error_message: errorMessage,
  });

  if (status === "failed") {
    return { sent: false, error: errorMessage ?? undefined };
  }
  return { sent: true };
}
