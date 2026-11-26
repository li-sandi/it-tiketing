import { NextResponse } from "next/server";
import { cekCronSecret } from "@/lib/cron-auth";
import { notifTiketDitutupOtomatis } from "@/lib/notifikasi";
import { purgeRemoteScreenshots } from "@/lib/remote-cleanup";
import { getFeatureFlags } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

const FALLBACK_AUTO_CLOSE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (!cekCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const flags = await getFeatureFlags();
    const closedIds: string[] = [];

    if (flags.auto_close_follow_sla) {
      const { data: closedRows, error: rpcError } = await admin.rpc(
        "auto_close_due_tickets",
      );
      if (rpcError) {
        throw new Error(`Gagal auto-close sesuai SLA: ${rpcError.message}`);
      }
      for (const row of closedRows ?? []) {
        if (typeof row === "string") closedIds.push(row);
      }
    } else {
      const cutoff = new Date(Date.now() - FALLBACK_AUTO_CLOSE_AFTER_MS).toISOString();
      const { data: tickets, error: ticketsError } = await admin
        .from("tickets")
        .select("id")
        .eq("status", "selesai")
        .lte("selesai_pada", cutoff);
      if (ticketsError) {
        throw new Error(`Gagal memuat tiket selesai: ${ticketsError.message}`);
      }

      for (const ticket of tickets ?? []) {
        const { data: closed, error: closeError } = await admin.rpc(
          "auto_close_ticket",
          {
            p_ticket_id: ticket.id,
            p_cutoff: cutoff,
          },
        );
        if (closeError) {
          console.error(`Gagal auto-close tiket ${ticket.id}:`, closeError.message);
          continue;
        }
        if (closed) closedIds.push(ticket.id);
      }
    }

    for (const ticketId of closedIds) {
      await purgeRemoteScreenshots(ticketId).catch((err) =>
        console.error(`Gagal bersihkan foto remote ${ticketId}:`, err),
      );
    }

    const { data: failedDeliveries, error: deliveriesError } = await admin
      .from("telegram_notification_deliveries")
      .select("ticket_id")
      .eq("notification_type", "auto_close")
      .eq("status", "failed");

    if (deliveriesError) {
      throw new Error(
        `Gagal mencari notifikasi auto-close yang gagal: ${deliveriesError.message}`,
      );
    }

    const idsToNotify = [
      ...new Set([
        ...closedIds,
        ...(failedDeliveries ?? []).map((delivery) => delivery.ticket_id),
      ]),
    ];
    const notifiedIds: string[] = [];
    for (const ticketId of idsToNotify) {
      try {
        const result = await notifTiketDitutupOtomatis(ticketId);
        if (result.sent > 0) notifiedIds.push(ticketId);
      } catch (error) {
        console.error(`Gagal kirim auto-close notif ${ticketId}:`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      mode: flags.auto_close_follow_sla ? "sla" : "24h",
      closed: closedIds.length,
      notified: notifiedIds.length,
      closedIds,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat auto-close tiket.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
