import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const ACTIVE_STATUSES = [
  "baru",
  "diproses",
  "menunggu_user",
  "dijadwalkan_kunjungan",
  "menunggu_pengadaan",
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function relationName(
  value: { nama: string } | { nama: string }[] | null,
) {
  return Array.isArray(value) ? value[0]?.nama ?? "—" : value?.nama ?? "—";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default async function TiketPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
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

  const isStaff = profile?.peran === "it" || profile?.peran === "admin";
  const params = await searchParams;
  const selectedSite =
    typeof params.site === "string" && UUID_PATTERN.test(params.site)
      ? params.site
      : "";
  const admin = createAdminClient();

  let activeQuery = admin
    .from("tickets")
    .select(
      "id, nomor_tiket, pembuat_id, site_id, status, prioritas, dibuat_pada, categories(nama), sites(nama)",
    )
    .in("status", [...ACTIVE_STATUSES])
    .order("prioritas", { ascending: true })
    .order("dibuat_pada", { ascending: true });
  if (selectedSite) activeQuery = activeQuery.eq("site_id", selectedSite);

  const [
    { data: activeTickets, error: activeError },
    { data: sites, error: sitesError },
    { data: myHistory, error: historyError },
  ] = await Promise.all([
    activeQuery,
    supabase.from("sites").select("id, nama").order("nama"),
    supabase
      .from("tickets")
      .select("id, nomor_tiket, status, prioritas, dibuat_pada, categories(nama)")
      .eq("pembuat_id", user.id)
      .in("status", ["selesai", "ditutup"])
      .order("dibuat_pada", { ascending: false })
      .limit(50),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tiket Aktif</h1>
          <p className="mt-1 text-sm text-gray-600">
            Ringkasan tiket aktif lintas site, diurutkan dari prioritas tertinggi.
          </p>
        </div>
        <Link
          href="/tiket/baru"
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          + Tiket Baru
        </Link>
      </div>

      <form
        action="/tiket"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded border p-4"
      >
        <div>
          <label htmlFor="site-filter" className="mb-1 block text-sm font-medium">
            Filter site
          </label>
          <select
            id="site-filter"
            name="site"
            defaultValue={selectedSite}
            className="min-w-56 rounded border bg-white px-3 py-2"
          >
            <option value="">Semua site</option>
            {(sites ?? []).map((site) => (
              <option key={site.id} value={site.id}>
                {site.nama}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded border px-4 py-2 hover:bg-gray-50"
        >
          Terapkan
        </button>
        {selectedSite && (
          <Link href="/tiket" className="px-2 py-2 text-sm underline">
            Hapus filter
          </Link>
        )}
        {sitesError && (
          <p role="alert" className="text-sm text-red-700">
            Gagal memuat pilihan site: {sitesError.message}
          </p>
        )}
      </form>

      {activeError ? (
        <p role="alert" className="rounded border border-red-300 p-4 text-red-700">
          Gagal memuat tiket aktif: {activeError.message}
        </p>
      ) : !activeTickets?.length ? (
        <p className="rounded border p-6 text-center text-gray-500">
          Tidak ada tiket aktif untuk filter ini.
        </p>
      ) : (
        <ul className="space-y-2">
          {activeTickets.map((ticket) => {
            const content = (
              <>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-500">
                    {ticket.nomor_tiket}
                  </span>
                  <PrioritasBadge prioritas={ticket.prioritas} />
                  <StatusBadge status={ticket.status} />
                </div>
                <p className="font-medium">{relationName(ticket.categories)}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {relationName(ticket.sites)} · {formatDate(ticket.dibuat_pada)}
                </p>
              </>
            );
            const canOpen =
              isStaff || ticket.pembuat_id === user.id;

            return (
              <li key={ticket.id} className="rounded border p-4">
                {canOpen ? (
                  <Link
                    href={`/tiket/${ticket.id}`}
                    className="block rounded hover:bg-gray-50"
                  >
                    {content}
                  </Link>
                ) : (
                  <div>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-3 border-t pt-6">
        <div>
          <h2 className="text-xl font-semibold">Riwayat tiket saya</h2>
          <p className="mt-1 text-sm text-gray-600">
            Tiket selesai dan ditutup yang kamu buat.
          </p>
        </div>
        {historyError ? (
          <p role="alert" className="text-red-700">
            Gagal memuat riwayat tiket: {historyError.message}
          </p>
        ) : !myHistory?.length ? (
          <p className="text-sm text-gray-500">Belum ada tiket selesai.</p>
        ) : (
          <ul className="space-y-2">
            {myHistory.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/tiket/${ticket.id}`}
                  className="block rounded border p-4 hover:bg-gray-50"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">
                      {ticket.nomor_tiket}
                    </span>
                    <PrioritasBadge prioritas={ticket.prioritas} />
                    <StatusBadge status={ticket.status} />
                  </div>
                  <p className="font-medium">{relationName(ticket.categories)}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {formatDate(ticket.dibuat_pada)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
