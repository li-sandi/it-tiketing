import { Suspense } from "react";
import { notFound } from "next/navigation";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicTicketStatus, {
  type TicketDetail,
} from "@/components/tiket/PublicTicketStatus";
import { getCategoryById } from "@/lib/data/categories";
import { getSiteById } from "@/lib/data/sites";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function PublicTicketStatusSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div className="animate-pulse space-y-4 rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="h-5 w-48 rounded bg-[var(--surface-muted)]" />
          <div className="h-4 w-24 rounded bg-[var(--surface-muted)]" />
        </div>
        <div className="h-7 w-64 rounded bg-[var(--surface-muted)]" />
      </div>
      <div className="grid animate-pulse gap-4 rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:grid-cols-2">
        <div className="h-12 rounded bg-[var(--surface-muted)]" />
        <div className="h-12 rounded bg-[var(--surface-muted)]" />
        <div className="h-12 rounded bg-[var(--surface-muted)]" />
        <div className="h-12 rounded bg-[var(--surface-muted)]" />
      </div>
      <div className="h-32 animate-pulse rounded-xl border bg-[var(--surface)] p-5 shadow-xs" />
    </main>
  );
}

async function PublicTicketStatusLoader({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID_PATTERN.test(token)) notFound();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error(
      "Konfigurasi Supabase admin tidak tersedia untuk status tiket:",
      err instanceof Error ? err.message : err,
    );
    return (
      <PublicTicketStatus
        token={token}
        initialDetail={null}
        initialError="Gagal memuat status tiket."
      />
    );
  }
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select(
      "id, nomor_tiket, status, prioritas, prioritas_awal, aging_level, approval_status, estimasi_pengadaan, stock_kode, kunjungan_pada, deskripsi, penanganan, site_id, category_id, it_id, dibuat_pada, selesai_pada, poin_kesulitan, catatan_solusi, rating",
    )
    .eq("akses_token", token)
    .maybeSingle();

  if (ticketError) {
    console.error("Gagal membaca tiket dengan token publik:", ticketError.message);
    return (
      <PublicTicketStatus
        token={token}
        initialDetail={null}
        initialError="Gagal memuat status tiket."
      />
    );
  }

  if (!ticket) {
    return (
      <PublicTicketStatus
        token={token}
        initialDetail={null}
        initialError="Tiket tidak ditemukan."
      />
    );
  }

  const [
    categoryResult,
    siteResult,
    { data: events, error: eventsError },
    { data: attachments, error: attachmentError },
    { data: it, error: itError },
  ] = await Promise.all([
    getCategoryById(ticket.category_id).catch((err) => {
      console.error("Gagal memuat kategori tiket publik:", err);
      return null;
    }),
    ticket.site_id
      ? getSiteById(ticket.site_id).catch((err) => {
          console.error("Gagal memuat site tiket publik:", err);
          return null;
        })
      : Promise.resolve(null),
    admin
      .from("ticket_events")
      .select("jenis, dari, ke, waktu, aktor_id")
      .eq("ticket_id", ticket.id)
      .order("waktu", { ascending: true })
      .limit(100),
    admin
      .from("attachments")
      .select("id, path_file, jenis")
      .eq("ticket_id", ticket.id)
      .neq("jenis", "foto_remote")
      .order("diunggah_pada", { ascending: true })
      .limit(20),
    ticket.it_id
      ? admin.from("users").select("nama").eq("id", ticket.it_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const relatedError = eventsError ?? attachmentError ?? itError;
  if (relatedError) {
    console.error("Gagal memuat detail tiket publik:", relatedError.message);
    return (
      <PublicTicketStatus
        token={token}
        initialDetail={null}
        initialError="Gagal memuat detail tiket."
      />
    );
  }

  const actorIds = Array.from(
    new Set(
      (events ?? [])
        .map((event) => event.aktor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [actorResult, attachmentsWithUrl] = await Promise.all([
    actorIds.length
      ? admin.from("users").select("id, nama").in("id", actorIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(
      (attachments ?? []).map(async (attachment) => {
        const { data, error } = await admin.storage
          .from("ticket-attachments")
          .createSignedUrl(attachment.path_file, 900);
        if (error) {
          console.error("Gagal membuat URL lampiran tiket publik:", error.message);
        }
        return {
          id: attachment.id,
          url: data?.signedUrl ?? null,
          error: error ? "Lampiran tidak dapat dimuat." : null,
        };
      }),
    ),
  ]);

  if (actorResult.error) {
    console.error(
      "Gagal membaca aktor timeline publik:",
      actorResult.error.message,
    );
    return (
      <PublicTicketStatus
        token={token}
        initialDetail={null}
        initialError="Gagal memuat riwayat tiket."
      />
    );
  }

  const actorNames = new Map(
    (actorResult.data ?? []).map((actor) => [actor.id, actor.nama]),
  );

  const detail: TicketDetail = {
    tiket: {
      nomor_tiket: ticket.nomor_tiket,
      status: ticket.status,
      prioritas: ticket.prioritas,
      prioritas_awal: ticket.prioritas_awal,
      aging_level: ticket.aging_level,
      approval_status: ticket.approval_status,
      estimasi_pengadaan: ticket.estimasi_pengadaan,
      stock_kode: ticket.stock_kode,
      kunjungan_pada: ticket.kunjungan_pada,
      deskripsi: ticket.deskripsi,
      penanganan: ticket.penanganan,
      dibuat_pada: ticket.dibuat_pada,
      selesai_pada: ticket.selesai_pada,
      poin_kesulitan: ticket.poin_kesulitan,
      catatan_solusi: ticket.catatan_solusi,
      rating: ticket.rating,
      kategori: categoryResult?.nama ?? null,
      site: siteResult?.nama ?? null,
      it: it?.nama ?? null,
    },
    events: (events ?? []).map((event) => ({
      jenis: event.jenis,
      dari: event.dari,
      ke: event.ke,
      waktu: event.waktu,
      aktor: event.aktor_id
        ? actorNames.get(event.aktor_id) ?? "IT"
        : event.ke === "ditutup"
          ? "Pelapor"
          : "Sistem",
    })),
    attachments: attachmentsWithUrl,
  };

  return (
    <PublicTicketStatus
      token={token}
      initialDetail={detail}
      initialError={null}
    />
  );
}

export default function PublicTicketStatusPage({
  params,
}: PageProps<"/status/[token]">) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <PublicHeader />
      <Suspense fallback={<PublicTicketStatusSkeleton />}>
        <PublicTicketStatusLoader params={params} />
      </Suspense>
    </div>
  );
}
