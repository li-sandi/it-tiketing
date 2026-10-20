import { NextResponse } from "next/server";
import { cekCronSecret } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/telegram";
import { notifyTicketRecipients } from "@/lib/notifikasi";
import { ambangWarningMenit } from "@/lib/sla";

const ACTIVE_STATUSES = ["baru", "diproses"] as const;

type SlaNotificationType =
  | "sla_respon_mendekati"
  | "sla_respon_lewat"
  | "sla_resolusi_mendekati"
  | "sla_resolusi_lewat";

type Candidate = {
  ticketId: string;
  type: SlaNotificationType;
  itId: string | null;
  siteId: string | null;
  ticketNumber: string;
  priority: string;
  description: string;
};

function buildTicketLink(ticketId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(`/tiket/${encodeURIComponent(ticketId)}`, base);
  return escapeHtml(url.toString());
}

async function findRecipients(
  admin: ReturnType<typeof createAdminClient>,
  candidate: Candidate,
) {
  if (candidate.itId) {
    const { data, error } = await admin
      .from("users")
      .select("id, nama, telegram_id")
      .eq("id", candidate.itId)
      .maybeSingle();
    if (error) throw new Error(`Gagal mencari IT pemegang tiket: ${error.message}`);
    if (data?.telegram_id) return [data];
  }

  if (candidate.siteId) {
    const { data, error } = await admin
      .from("users")
      .select("id, nama, telegram_id")
      .eq("peran", "it")
      .eq("site_id", candidate.siteId)
      .not("telegram_id", "is", null);
    if (error) throw new Error(`Gagal mencari IT di site: ${error.message}`);
    if (data?.length) return data;
  }

  const { data, error } = await admin
    .from("users")
    .select("id, nama, telegram_id")
    .eq("peran", "it")
    .not("telegram_id", "is", null);
  if (error) throw new Error(`Gagal mencari IT penerima: ${error.message}`);
  return data ?? [];
}

export async function GET(request: Request) {
  if (!cekCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = Date.now();

    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, nomor_tiket, prioritas, status, it_id, site_id, deskripsi, sla_respon_batas, sla_resolusi_batas")
      .in("status", [...ACTIVE_STATUSES]);

    if (ticketsError) {
      throw new Error(`Gagal memuat tiket aktif: ${ticketsError.message}`);
    }

    const candidates: Candidate[] = [];

    for (const ticket of tickets ?? []) {
      const warningMinutes = ambangWarningMenit(ticket.prioritas);
      const responseDeadline = ticket.sla_respon_batas
        ? new Date(ticket.sla_respon_batas).getTime()
        : null;
      const resolutionDeadline = ticket.sla_resolusi_batas
        ? new Date(ticket.sla_resolusi_batas).getTime()
        : null;

      if (ticket.status === "baru" && responseDeadline && Number.isFinite(responseDeadline)) {
        const nearThreshold = responseDeadline - warningMinutes * 60 * 1000;
        const type =
          now >= responseDeadline
            ? "sla_respon_lewat"
            : now >= nearThreshold
              ? "sla_respon_mendekati"
              : null;
        if (type) candidates.push({
          ticketId: ticket.id,
          type,
          itId: ticket.it_id,
          siteId: ticket.site_id,
          ticketNumber: ticket.nomor_tiket,
          priority: ticket.prioritas,
          description: ticket.deskripsi,
        });
      }

      if (ticket.status === "diproses" && resolutionDeadline && Number.isFinite(resolutionDeadline)) {
        const nearThreshold = resolutionDeadline - warningMinutes * 60 * 1000;
        const type =
          now >= resolutionDeadline
            ? "sla_resolusi_lewat"
            : now >= nearThreshold
              ? "sla_resolusi_mendekati"
              : null;
        if (type) candidates.push({
          ticketId: ticket.id,
          type,
          itId: ticket.it_id,
          siteId: ticket.site_id,
          ticketNumber: ticket.nomor_tiket,
          priority: ticket.prioritas,
          description: ticket.deskripsi,
        });
      }
    }

    const results: Array<{ ticket: string; tipe: SlaNotificationType; terkirim: number }> = [];
    for (const candidate of candidates) {
      try {
        const recipients = await findRecipients(admin, candidate);
        const late = candidate.type.endsWith("_lewat");
        const response = candidate.type.includes("respon");
        const label = response ? "SLA Respon" : "SLA Resolusi";
        const condition = late ? "TERLAMBAT" : "mendekati batas";
        const emoji = late ? "🔴" : "⏰";
        const description = escapeHtml(candidate.description.replace(/\s+/g, " ").trim().slice(0, 150));
        const message = `${emoji} <b>${label} ${condition}</b>
${escapeHtml(candidate.ticketNumber)} — ${escapeHtml(candidate.priority)}

${description}

<a href="${buildTicketLink(candidate.ticketId)}">Buka tiket →</a>`;
        const outcome = await notifyTicketRecipients(
          candidate.ticketId,
          candidate.type,
          recipients.map(({ id, nama, telegram_id }) => ({ id, nama, telegram_id })),
          message,
        );
        results.push({
          ticket: candidate.ticketNumber,
          tipe: candidate.type,
          terkirim: outcome.sent,
        });
      } catch (error) {
        console.error(`Gagal kirim SLA ${candidate.type} untuk ${candidate.ticketId}:`, error);
        results.push({
          ticket: candidate.ticketNumber,
          tipe: candidate.type,
          terkirim: 0,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      totalTiket: tickets?.length ?? 0,
      totalKandidat: candidates.length,
      hasil: results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan saat mengecek SLA.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
