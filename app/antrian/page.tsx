import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

function getRelationName(
  relation: { nama: string } | { nama: string }[] | null,
) {
  if (Array.isArray(relation)) return relation[0]?.nama ?? "—";
  return relation?.nama ?? "—";
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
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return (
      <main className="mx-auto w-full max-w-5xl p-8">
        <p role="alert" className="text-red-700">
          Gagal memeriksa profil: {profileError.message}
        </p>
      </main>
    );
  }
  if (!profile || !["it", "admin"].includes(profile.peran)) {
    redirect("/tiket");
  }

  const ticketFields =
    "id, nomor_tiket, deskripsi, prioritas, status, dibuat_pada, categories(nama), sites(nama)";
  let queueQuery = supabase
    .from("tickets")
    .select(ticketFields)
    .eq("status", "baru");
  if (profile.peran === "it") {
    queueQuery = queueQuery.is("it_id", null);
  }
  const myTicketStatuses = [
    ...(profile.peran === "it" ? ["baru"] : []),
    "diproses",
    "menunggu_user",
    "dijadwalkan_kunjungan",
    "menunggu_pengadaan",
  ];
  const [{ data: queue, error: queueError }, { data: myTickets, error: myTicketsError }] =
    await Promise.all([
      queueQuery
        .order("prioritas", { ascending: true })
        .order("dibuat_pada", { ascending: true }),
      supabase
        .from("tickets")
        .select(ticketFields)
        .eq("it_id", user.id)
        .in("status", myTicketStatuses)
        .order("prioritas", { ascending: true })
        .order("dibuat_pada", { ascending: true }),
    ]);

  function renderTickets(
    tickets: NonNullable<typeof queue>,
    emptyMessage: string,
    showSite: boolean,
  ) {
    if (!tickets.length) {
      return <p className="text-sm text-gray-500">{emptyMessage}</p>;
    }

    return (
      <ul className="space-y-2">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <Link
              href={`/tiket/${ticket.id}`}
              className="block rounded border p-4 hover:bg-gray-50"
            >
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-gray-500">
                  {ticket.nomor_tiket}
                </span>
                <PrioritasBadge prioritas={ticket.prioritas} />
                <StatusBadge status={ticket.status} />
              </div>
              <p className="font-medium">
                {getRelationName(ticket.categories)}
              </p>
              <p className="truncate text-sm text-gray-700">
                {ticket.deskripsi}
              </p>
              {showSite && (
                <p className="mt-1 text-xs text-gray-500">
                  Site {getRelationName(ticket.sites)} ·{" "}
                  {formatDate(ticket.dibuat_pada)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Antrian IT</h1>
        <Link
          href="/dashboard"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Antrian Baru ({queue?.length ?? 0})
        </h2>
        {queueError ? (
          <p role="alert" className="text-red-700">
            Gagal memuat antrian baru: {queueError.message}
          </p>
        ) : (
          renderTickets(queue ?? [], "Tidak ada tiket baru. 🎉", true)
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Tiket Saya ({myTickets?.length ?? 0})
        </h2>
        {myTicketsError ? (
          <p role="alert" className="text-red-700">
            Gagal memuat tiket yang sedang ditangani: {myTicketsError.message}
          </p>
        ) : (
          renderTickets(
            myTickets ?? [],
            "Kamu belum memegang tiket aktif.",
            false,
          )
        )}
      </section>
    </main>
  );
}
