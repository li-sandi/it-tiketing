import "server-only";

import { addDaysToDate, getJakartaDate } from "@/lib/jadwal-sleman";
import {
  buildTicketLink,
  compactDescription,
  notifP0Broadcast,
  notifTiketBaru,
  notifyTicketRecipients,
} from "@/lib/notifikasi";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/telegram";

export type KunjunganInfo = {
  mode: "hari_ini" | "dijadwalkan";
  tanggal: string;
  tanggalLabel: string;
  itNama: string | null;
};

type Staff = { id: string; nama: string; telegram_id: string };

function formatTanggal(tanggal: string) {
  return new Date(`${tanggal}T00:00:00.000Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function staffBerTelegram(
  rows: Array<{ id: string; nama: string; telegram_id: string | null }> | null,
): Staff[] {
  return (rows ?? []).filter(
    (row): row is Staff =>
      typeof row.telegram_id === "string" && row.telegram_id.length > 0,
  );
}

async function ambilPetugasTerjadwal(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
) {
  if (!ids.length) return [];
  const { data, error } = await admin
    .from("users")
    .select("id, nama, telegram_id")
    .eq("peran", "it")
    .in("id", ids);
  if (error) throw new Error(`Gagal membaca petugas IT terjadwal: ${error.message}`);
  const staff = staffBerTelegram(data);
  const missingIds = ids.filter(
    (id) => !staff.some((item) => item.id === id),
  );
  if (missingIds.length) {
    throw new Error(
      `Petugas jadwal belum menghubungkan Telegram: ${missingIds.join(", ")}.`,
    );
  }
  return staff;
}

async function kirimNotifikasiKunjungan(
  ticketId: string,
  staff: Staff[],
  message: string,
  notificationType: "kunjungan_sleman" | "kunjungan_sleman_reminder",
) {
  await notifyTicketRecipients(ticketId, notificationType, staff, message);
}

export async function arahkanTiketSleman(
  ticketId: string,
): Promise<{ kunjungan: KunjunganInfo; warnings: string[] } | null> {
  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select(
      "id, nomor_tiket, prioritas, deskripsi, penanganan, status, it_id, site_id, pembuat_nama, category_id",
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError) throw new Error(`Gagal membaca tiket: ${ticketError.message}`);
  if (
    !ticket ||
    ticket.status !== "baru" ||
    ticket.it_id ||
    ticket.penanganan !== "onsite" ||
    !ticket.site_id
  ) {
    return null;
  }

  const [
    { data: site, error: siteError },
    { data: category, error: categoryError },
  ] = await Promise.all([
    admin
      .from("sites")
      .select("id, nama, punya_it")
      .eq("id", ticket.site_id)
      .maybeSingle(),
    admin
      .from("categories")
      .select("nama")
      .eq("id", ticket.category_id)
      .maybeSingle(),
  ]);
  if (siteError) throw new Error(`Gagal membaca site tiket: ${siteError.message}`);
  if (categoryError) {
    throw new Error(`Gagal membaca kategori tiket: ${categoryError.message}`);
  }
  if (!site || site.punya_it) return null;

  const today = getJakartaDate();
  const { data: upcoming, error: scheduleError } = await admin
    .from("it_schedule")
    .select("tanggal, it_id")
    .eq("site_id", site.id)
    .eq("jenis", "kunjungan_sleman")
    .gte("tanggal", today)
    .order("tanggal", { ascending: true })
    .limit(2);
  if (scheduleError) {
    throw new Error(`Gagal membaca jadwal kunjungan: ${scheduleError.message}`);
  }
  const next = upcoming?.[0];
  if (!next) return null;
  if (upcoming?.[1]?.tanggal === next.tanggal) {
    throw new Error(`Jadwal kunjungan ${next.tanggal} terduplikasi.`);
  }

  const urgent = ticket.prioritas === "P0" || ticket.prioritas === "P1";
  const categoryName = escapeHtml(category?.nama ?? "-");
  const ticketSummary = `${escapeHtml(ticket.nomor_tiket)} — ${categoryName}
Site: ${escapeHtml(site.nama)}
Dari: ${escapeHtml(ticket.pembuat_nama ?? "-")}

${compactDescription(ticket.deskripsi)}`;

  if (urgent) {
    const staff = await ambilPetugasTerjadwal(admin, [next.it_id]);
    const assignedStaff = staff.find((item) => item.id === next.it_id);
    if (!assignedStaff) {
      throw new Error("Petugas jadwal kunjungan tidak ditemukan.");
    }
    const message = `🚨 <b>Tiket Sleman ${escapeHtml(ticket.prioritas)} — perlu ditangani hari ini</b>
${ticketSummary}

${buildTicketLink(ticket.id, "Buka tiket →")}`;
    const warnings: string[] = [];
    try {
      await kirimNotifikasiKunjungan(
        ticket.id,
        [assignedStaff],
        message,
        "kunjungan_sleman",
      );
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "Notifikasi petugas kunjungan gagal dikirim.",
      );
    }

    return {
      kunjungan: {
        mode: "hari_ini",
        tanggal: today,
        tanggalLabel: formatTanggal(today),
        itNama: assignedStaff?.nama ?? null,
      },
      warnings,
    };
  }

  const { data: scheduled, error: updateError } = await admin.rpc(
    "schedule_sleman_ticket",
    {
      p_ticket_id: ticket.id,
      p_schedule_date: next.tanggal,
      p_it_id: next.it_id,
    },
  );
  if (updateError) {
    throw new Error(`Gagal menjadwalkan tiket Sleman: ${updateError.message}`);
  }
  if (!scheduled) return null;

  const staff = await ambilPetugasTerjadwal(admin, [next.it_id]);
  const assignedStaff = staff.find((item) => item.id === next.it_id);
  if (!assignedStaff) {
    throw new Error("Petugas jadwal kunjungan tidak ditemukan.");
  }
  const dateLabel = formatTanggal(next.tanggal);
  const message = `📅 <b>Tiket Sleman masuk daftar kunjungan</b>
Kunjungan: ${escapeHtml(dateLabel)}
${ticketSummary}

${buildTicketLink(ticket.id, "Buka tiket →")}`;
  const warnings: string[] = [];
  try {
    await kirimNotifikasiKunjungan(
      ticket.id,
      [assignedStaff],
      message,
      "kunjungan_sleman",
    );
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Notifikasi petugas kunjungan gagal dikirim.",
    );
  }

  return {
    kunjungan: {
      mode: next.tanggal === today ? "hari_ini" : "dijadwalkan",
      tanggal: next.tanggal,
      tanggalLabel: dateLabel,
      itNama: assignedStaff?.nama ?? null,
    },
    warnings,
  };
}

export async function prosesNotifikasiTiketBaru(ticketId: string) {
  const warnings: string[] = [];
  let routed: Awaited<ReturnType<typeof arahkanTiketSleman>> = null;
  let routingFailed = false;

  try {
    routed = await arahkanTiketSleman(ticketId);
    if (routed) warnings.push(...routed.warnings);
  } catch (error) {
    routingFailed = true;
    warnings.push(
      error instanceof Error ? error.message : "Routing tiket Sleman gagal.",
    );
  }

  const tasks: Promise<unknown>[] = [notifP0Broadcast(ticketId)];
  if (!routed) tasks.push(notifTiketBaru(ticketId));
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      warnings.push(
        result.reason instanceof Error
          ? result.reason.message
          : "Notifikasi tiket baru gagal dikirim.",
      );
    }
  }

  if (routingFailed) {
    console.error(`Routing tiket ${ticketId} ke kunjungan Sleman gagal.`);
  }
  return { warnings, kunjungan: routed?.kunjungan ?? null };
}

export async function kirimPengingatKunjungan() {
  const admin = createAdminClient();
  const tomorrow = addDaysToDate(getJakartaDate(), 1);
  const { data: schedule, error: scheduleError } = await admin
    .from("it_schedule")
    .select("site_id, it_id")
    .eq("jenis", "kunjungan_sleman")
    .eq("tanggal", tomorrow);
  if (scheduleError) {
    throw new Error(`Gagal membaca jadwal kunjungan: ${scheduleError.message}`);
  }
  if (!schedule?.length) {
    return { tanggal: tomorrow, penerima: 0, tiket: 0 };
  }

  const duplicateSchedule = schedule.find(
    (entry, index) =>
      schedule.findIndex(
        (candidate) => candidate.site_id === entry.site_id,
      ) !== index,
  );
  if (duplicateSchedule) {
    throw new Error(
      `Jadwal kunjungan petugas/site ${duplicateSchedule.it_id}/${duplicateSchedule.site_id} terduplikasi pada ${tomorrow}.`,
    );
  }

  const siteIds = [...new Set(schedule.map((item) => item.site_id).filter(Boolean))];
  const ticketsQuery = siteIds.length
    ? await admin
        .from("tickets")
          .select(
            "id, site_id, it_id, status, kunjungan_pada, nomor_tiket, prioritas, deskripsi, categories(nama)",
          )
        .in("site_id", siteIds)
        .eq("penanganan", "onsite")
        .eq("status", "dijadwalkan_kunjungan")
        .eq("kunjungan_pada", tomorrow)
        .order("dibuat_pada", { ascending: true })
    : { data: [], error: null };
  if (ticketsQuery.error) {
    throw new Error(`Gagal membaca tiket onsite: ${ticketsQuery.error.message}`);
  }

  const ticketRows = ticketsQuery.data ?? [];
  if (!ticketRows.length) {
    return { tanggal: tomorrow, penerima: 0, tiket: 0 };
  }

  const ticketsByPetugas = new Map<string, typeof ticketRows>();
  for (const ticket of ticketRows) {
    if (!ticket.it_id) continue;
    const assignedTickets = ticketsByPetugas.get(ticket.it_id) ?? [];
    assignedTickets.push(ticket);
    ticketsByPetugas.set(ticket.it_id, assignedTickets);
  }

  const staff = await ambilPetugasTerjadwal(
    admin,
    [...ticketsByPetugas.keys()],
  );
  let sent = 0;
  for (const [itId, assignedTickets] of ticketsByPetugas) {
    const recipient = staff.find((item) => item.id === itId);
    if (!recipient) {
      throw new Error(
        `Petugas ${itId} tidak ditemukan untuk pengingat ${tomorrow}.`,
      );
    }
    const list = assignedTickets
      .map((ticket) => {
        const category = Array.isArray(ticket.categories)
          ? ticket.categories[0]
          : ticket.categories;
        return `• ${escapeHtml(ticket.prioritas)} ${escapeHtml(ticket.nomor_tiket)} — ${escapeHtml(category?.nama ?? "-")}: ${compactDescription(ticket.deskripsi).slice(0, 80)}`;
      })
      .join("\n");
    const message = `📅 <b>Kunjungan Sleman besok (${escapeHtml(formatTanggal(tomorrow))})</b>

${list}`;

    await notifyTicketRecipients(
      assignedTickets[0].id,
      "kunjungan_sleman_reminder",
      [recipient],
      message,
    );
    sent++;
  }

  return { tanggal: tomorrow, penerima: sent, tiket: ticketRows.length };
}
