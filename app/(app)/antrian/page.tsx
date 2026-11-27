import { Suspense } from "react";
import { redirect } from "next/navigation";
import AntrianLoading from "@/app/(app)/antrian/loading";
import ItStatusToggle from "@/components/it/ItStatusToggle";
import TicketBoardClient from "@/components/tiket/TicketBoardClient";
import { getCurrentUserProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function getRelationName(
  relation: { nama: string } | { nama: string }[] | null,
) {
  if (Array.isArray(relation)) return relation[0]?.nama ?? "-";
  return relation?.nama ?? "-";
}

async function AntrianContent() {
  const [profile, supabase] = await Promise.all([
    getCurrentUserProfile(),
    createClient(),
  ]);
  if (!profile) redirect("/login");
  if (!["it", "admin"].includes(profile.peran)) {
    redirect("/tiket");
  }

  const ticketFields =
    "id, nomor_tiket, deskripsi, prioritas, aging_level, status, dibuat_pada, categories(nama), sites(nama)";
  let queueQuery = supabase
    .from("tickets")
    .select(ticketFields)
    .eq("status", "baru");
  if (profile.peran === "it") {
    queueQuery = queueQuery.is("it_id", null);
  }
  const procurementQueueQuery = supabase
    .from("tickets")
    .select(ticketFields)
    .eq("status", "menunggu_pengadaan")
    .is("it_id", null)
    .order("prioritas", { ascending: true })
    .order("dibuat_pada", { ascending: true });
  const myTicketStatuses = [
    ...(profile.peran === "it" ? ["baru"] : []),
    "diproses",
    "menunggu_user",
    "dijadwalkan_kunjungan",
    "menunggu_pengadaan",
  ];
  const [
    { data: queue, error: queueError },
    { data: procurementQueue, error: procurementError },
    { data: myTickets, error: myTicketsError },
    { data: myStatusRow },
  ] = await Promise.all([
    queueQuery
      .order("prioritas", { ascending: true })
      .order("dibuat_pada", { ascending: true }),
    procurementQueueQuery,
    supabase
      .from("tickets")
      .select(ticketFields)
      .eq("it_id", profile.id)
      .in("status", myTicketStatuses)
      .order("prioritas", { ascending: true })
      .order("dibuat_pada", { ascending: true }),
    profile.peran === "it"
      ? supabase
          .from("it_status")
          .select("status")
          .eq("it_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  function toBoardRows(rows: NonNullable<typeof queue>) {
    return rows.map((ticket) => ({
      id: ticket.id,
      nomor_tiket: ticket.nomor_tiket,
      prioritas: ticket.prioritas,
      status: ticket.status,
      dibuat_pada: ticket.dibuat_pada,
      kategori: getRelationName(ticket.categories),
      site: getRelationName(ticket.sites),
      deskripsi: ticket.deskripsi,
      aging_level: ticket.aging_level,
      canOpen: true,
    }));
  }

  return (
    <>
      {profile.peran === "it" && (
        <ItStatusToggle initialStatus={myStatusRow?.status ?? "free"} />
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Antrian Baru ({queue?.length ?? 0})
        </h2>
        {queueError ? (
          <p role="alert" className="text-sm text-red-700">
            Gagal memuat antrian baru: {queueError.message}
          </p>
        ) : (
          <TicketBoardClient
            tickets={toBoardRows(queue ?? [])}
            emptyMessage="Tidak ada tiket baru di antrian."
            showSite
            showDescription
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Menunggu Pengadaan Sparepart ({procurementQueue?.length ?? 0})
        </h2>
        {procurementError ? (
          <p role="alert" className="text-sm text-red-700">
            Gagal memuat antrian pengadaan: {procurementError.message}
          </p>
        ) : (
          <TicketBoardClient
            tickets={toBoardRows(procurementQueue ?? [])}
            emptyMessage="Tidak ada tiket yang menunggu pengadaan sparepart."
            showSite
            showDescription
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Tiket Saya ({myTickets?.length ?? 0})
        </h2>
        {myTicketsError ? (
          <p role="alert" className="text-sm text-red-700">
            Gagal memuat tiket yang sedang ditangani: {myTicketsError.message}
          </p>
        ) : (
          <TicketBoardClient
            tickets={toBoardRows(myTickets ?? [])}
            emptyMessage="Anda belum memegang tiket aktif."
            showSite={false}
            showDescription
          />
        )}
      </section>
    </>
  );
}

export default function AntrianPage() {
  return (
    <Suspense fallback={<AntrianLoading />}>
      <AntrianContent />
    </Suspense>
  );
}
