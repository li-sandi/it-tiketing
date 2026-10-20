"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getNextTicketStatuses,
  type TicketStatus,
} from "@/lib/tiket-status";
import { notifTiketSelesai } from "@/lib/notifikasi";

type ActionResult = {
  error?: string;
  notice?: string;
};

type ActionContext =
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      userId: string;
      role: "it" | "admin";
    }
  | { error: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getActionContext(): Promise<ActionContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Sesi tidak valid. Silakan login lagi." };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: `Gagal memeriksa peran akun: ${profileError.message}` };
  }
  if (profile?.peran !== "it" && profile?.peran !== "admin") {
    return { error: "Aksi ini hanya tersedia untuk IT atau admin." };
  }

  return { supabase, userId: user.id, role: profile.peran };
}

function isActionError(context: ActionContext): context is { error: string } {
  return "error" in context;
}

async function writeEvents(
  context: Extract<ActionContext, { supabase: unknown }>,
  events: Array<{
    ticket_id: string;
    aktor_id: string;
    jenis: "status" | "assign";
    dari: string | null;
    ke: string;
  }>,
): Promise<string | null> {
  const { error } = await context.supabase.from("ticket_events").insert(events);
  return error?.message ?? null;
}

export async function claimTicket(ticketId: string): Promise<ActionResult> {
  if (!uuidPattern.test(ticketId)) return { error: "ID tiket tidak valid." };

  const context = await getActionContext();
  if (isActionError(context)) return context;

  const { data: ticket, error: readError } = await context.supabase
    .from("tickets")
    .select("id, it_id, status")
    .eq("id", ticketId)
    .maybeSingle();

  if (readError) return { error: `Gagal membaca tiket: ${readError.message}` };
  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.status !== "baru" || ticket.it_id) {
    return { error: "Tiket ini sudah diproses atau sudah diambil IT lain." };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await context.supabase
    .from("tickets")
    .update({
      it_id: context.userId,
      status: "diproses",
      diproses_pada: now,
    })
    .eq("id", ticketId)
    .eq("status", "baru")
    .is("it_id", null)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { error: `Gagal mengambil tiket: ${updateError.message}` };
  }
  if (!updated) {
    return { error: "Tiket baru saja diambil orang lain. Muat ulang halaman." };
  }

  const eventError = await writeEvents(context, [
    {
      ticket_id: ticketId,
      aktor_id: context.userId,
      jenis: "assign",
      dari: null,
      ke: context.userId,
    },
    {
      ticket_id: ticketId,
      aktor_id: context.userId,
      jenis: "status",
      dari: "baru",
      ke: "diproses",
    },
  ]);

  revalidatePath("/tiket");
  revalidatePath(`/tiket/${ticketId}`);

  if (eventError) {
    return {
      notice: `Tiket berhasil diambil, tetapi gagal menulis timeline: ${eventError}`,
    };
  }
  return { notice: "Tiket berhasil diambil." };
}

export async function changeTicketStatus(
  ticketId: string,
  nextStatus: TicketStatus,
  completion?: { poinKesulitan: number; catatanSolusi: string },
): Promise<ActionResult> {
  if (!uuidPattern.test(ticketId)) return { error: "ID tiket tidak valid." };
  if (
    !Object.prototype.hasOwnProperty.call(
      {
        baru: true,
        diproses: true,
        menunggu_user: true,
        dijadwalkan_kunjungan: true,
        menunggu_pengadaan: true,
        selesai: true,
        ditutup: true,
      },
      nextStatus,
    )
  ) {
    return { error: "Status tiket tidak valid." };
  }

  const context = await getActionContext();
  if (isActionError(context)) return context;

  const { data: ticket, error: readError } = await context.supabase
    .from("tickets")
    .select("id, it_id, status, diproses_pada")
    .eq("id", ticketId)
    .maybeSingle();

  if (readError) return { error: `Gagal membaca tiket: ${readError.message}` };
  if (!ticket) return { error: "Tiket tidak ditemukan." };

  const currentStatus = ticket.status as TicketStatus;
  if (!getNextTicketStatuses(currentStatus).includes(nextStatus)) {
    return {
      error: `Perubahan status dari ${currentStatus} ke ${nextStatus} tidak diizinkan.`,
    };
  }
  if (nextStatus === "selesai") {
    if (!completion) {
      return {
        error: "Poin kesulitan dan catatan solusi wajib diisi untuk menyelesaikan tiket.",
      };
    }
    if (typeof completion.catatanSolusi !== "string") {
      return { error: "Catatan solusi harus berupa teks yang valid." };
    }
    if (
      !Number.isInteger(completion.poinKesulitan) ||
      completion.poinKesulitan < 1 ||
      completion.poinKesulitan > 5
    ) {
      return { error: "Poin kesulitan harus dipilih dari 1 sampai 5." };
    }
    const catatanSolusi = completion.catatanSolusi.trim();
    if (catatanSolusi.length < 5 || catatanSolusi.length > 5000) {
      return {
        error: "Catatan solusi harus berisi 5 sampai 5.000 karakter.",
      };
    }
  }
  if (context.role !== "admin" && ticket.it_id !== context.userId) {
    return { error: "Hanya IT yang mengambil tiket ini yang dapat mengubah status." };
  }

  const now = new Date().toISOString();
  const updates: {
    status: TicketStatus;
    diproses_pada?: string;
    selesai_pada?: string | null;
    ditutup_pada?: string | null;
    poin_kesulitan?: number;
    catatan_solusi?: string;
  } = { status: nextStatus };

  if (nextStatus === "diproses" && !ticket.diproses_pada) {
    updates.diproses_pada = now;
  }
  if (nextStatus === "selesai") {
    if (!completion) {
      return { error: "Data penyelesaian tiket tidak tersedia." };
    }
    updates.selesai_pada = now;
    updates.poin_kesulitan = completion.poinKesulitan;
    updates.catatan_solusi = completion.catatanSolusi.trim();
  }
  if (currentStatus === "selesai" && nextStatus !== "ditutup") {
    updates.selesai_pada = null;
  }
  if (nextStatus === "ditutup") updates.ditutup_pada = now;

  let updateQuery = context.supabase
    .from("tickets")
    .update(updates)
    .eq("id", ticketId)
    .eq("status", currentStatus);
  if (context.role !== "admin") {
    updateQuery = updateQuery.eq("it_id", context.userId);
  }

  const { data: updated, error: updateError } = await updateQuery
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { error: `Gagal mengubah status: ${updateError.message}` };
  }
  if (!updated) {
    return { error: "Tiket berubah di sesi lain. Muat ulang halaman." };
  }

  const eventError = await writeEvents(context, [
    {
      ticket_id: ticketId,
      aktor_id: context.userId,
      jenis: "status",
      dari: currentStatus,
      ke: nextStatus,
    },
  ]);

  let notificationError: string | null = null;
  if (nextStatus === "selesai") {
    try {
      await notifTiketSelesai(ticketId);
    } catch (error) {
      notificationError =
        error instanceof Error
          ? error.message
          : "Notifikasi Telegram tiket selesai gagal.";
      console.error("Gagal mengirim notifikasi tiket selesai:", notificationError);
    }
  }

  revalidatePath("/tiket");
  revalidatePath(`/tiket/${ticketId}`);

  const warnings = [
    eventError && `gagal menulis timeline: ${eventError}`,
    notificationError && `gagal mengirim notifikasi: ${notificationError}`,
  ].filter((warning): warning is string => Boolean(warning));

  if (warnings.length) {
    return {
      notice: `Status berhasil diubah, tetapi ${warnings.join("; ")}.`,
    };
  }
  return { notice: "Status tiket berhasil diubah." };
}

export async function tutupTiketOlehUser(
  ticketId: string,
  rating: number,
): Promise<ActionResult> {
  if (!uuidPattern.test(ticketId)) return { error: "ID tiket tidak valid." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Rating harus 1-5." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Belum login." };

  const { data: ticket, error: readError } = await supabase
    .from("tickets")
    .select("pembuat_id, status")
    .eq("id", ticketId)
    .maybeSingle();

  if (readError) return { error: `Gagal membaca tiket: ${readError.message}` };
  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.pembuat_id !== user.id) {
    return { error: "Hanya pembuat tiket yang bisa menutup." };
  }
  if (ticket.status !== "selesai") {
    return { error: "Tiket belum selesai atau sudah ditutup." };
  }

  const { error: closeError } = await supabase.rpc("close_ticket_by_creator", {
    p_ticket_id: ticketId,
    p_rating: rating,
  });

  if (closeError) return { error: `Gagal menutup tiket: ${closeError.message}` };

  revalidatePath(`/tiket/${ticketId}`);
  revalidatePath("/tiket");
  return { notice: "Tiket berhasil ditutup. Terima kasih atas rating Anda." };
}
