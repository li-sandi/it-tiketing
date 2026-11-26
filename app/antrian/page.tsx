import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ItStatusToggle from "@/components/it/ItStatusToggle";
import AppShell from "@/components/layout/AppShell";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

function getRelationName(
  relation: { nama: string } | { nama: string }[] | null,
) {
  if (Array.isArray(relation)) return relation[0]?.nama ?? "-";
  return relation?.nama ?? "-";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
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

  function renderTickets(
    tickets: NonNullable<typeof queue>,
    emptyMessage: string,
    showSite: boolean,
  ) {
    if (!tickets.length) {
      return (
        <div className="rounded-xl border bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border bg-[var(--surface)] shadow-xs">
        <ul className="divide-y">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/tiket/${ticket.id}`}
                className="block px-4 py-3.5 hover:bg-[var(--surface-muted)] sm:px-5"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium tabular-nums text-[var(--muted)]">
                    {ticket.nomor_tiket}
                  </span>
                  <PrioritasBadge prioritas={ticket.prioritas} />
                  <StatusBadge status={ticket.status} />
                  {(ticket.aging_level ?? 0) > 0 && (
                    <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Aging +{ticket.aging_level}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {getRelationName(ticket.categories)}
                </p>
                <p className="mt-0.5 truncate text-sm text-[var(--secondary)]">
                  {ticket.deskripsi}
                </p>
                {showSite && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Site {getRelationName(ticket.sites)} · {formatDate(ticket.dibuat_pada)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Antrian Baru ({queue?.length ?? 0})
          </h2>
        </div>
        {queueError ? (
          <p role="alert" className="text-sm text-red-700">
            Gagal memuat antrian baru: {queueError.message}
          </p>
        ) : (
          renderTickets(queue ?? [], "Tidak ada tiket baru di antrian.", true)
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
          renderTickets(
            procurementQueue ?? [],
            "Tidak ada tiket yang menunggu pengadaan sparepart.",
            true,
          )
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
          renderTickets(
            myTickets ?? [],
            "Anda belum memegang tiket aktif.",
            false,
          )
        )}
      </section>
    </AppShell>
  );
}
