import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ItStatusToggle from "@/components/it/ItStatusToggle";
import AppShell from "@/components/layout/AppShell";
import TicketBoardClient from "@/components/tiket/TicketBoardClient";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

function getRelationName(
  relation: { nama: string } | { nama: string }[] | null,
) {
  if (Array.isArray(relation)) return relation[0]?.nama ?? "-";
  return relation?.nama ?? "-";
}

export default async function AntrianPage() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("nama, peran")
    .eq("id", user.id)
    .maybeSingle();

  const userName = profile?.nama ?? user.email ?? "Pengguna";

  if (profileError) {
    return (
      <AppShell
        userName={user.email ?? "Pengguna"}
        userEmail={user.email}
        role="user"
        pageTitle="Antrian IT"
      >
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memeriksa profil: {profileError.message}
        </p>
      </AppShell>
    );
  }
  if (!profile || !["it", "admin"].includes(profile.peran)) {
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
      .eq("it_id", user.id)
      .in("status", myTicketStatuses)
      .order("prioritas", { ascending: true })
      .order("dibuat_pada", { ascending: true }),
    supabase
      .from("it_status")
      .select("status")
      .eq("it_id", user.id)
      .maybeSingle(),
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
    <AppShell
      userName={userName}
      userEmail={user.email}
      role={profile.peran}
      pageTitle="Antrian IT"
      pageSubtitle="Kelola antrian masuk berdasarkan prioritas SLA, pengadaan sparepart, dan tiket aktif Anda."
      headerAction={
        <Link
          href="/stok"
          className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
        >
          Cek Stok Sparepart
        </Link>
      }
    >
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
    </AppShell>
  );
}
