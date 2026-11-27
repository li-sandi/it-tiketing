import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import TicketBoardClient from "@/components/tiket/TicketBoardClient";
import { getCurrentUserProfile } from "@/lib/auth";
import { getActiveSites } from "@/lib/data/sites";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  return Array.isArray(value) ? value[0]?.nama ?? "-" : value?.nama ?? "-";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function BoardSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-14 rounded-xl border bg-[var(--surface)]" />
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={idx}
          className="h-24 rounded-xl border bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <section className="space-y-3 pt-2">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Riwayat Tiket Saya
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Tiket selesai dan ditutup yang Anda buat.
        </p>
      </div>
      <div className="h-40 animate-pulse rounded-xl border bg-[var(--surface)]" />
    </section>
  );
}

async function SiteFilterSection({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const [params, sitesResult] = await Promise.all([
    searchParams,
    getActiveSites().then(
      (data) => ({ data, error: null as string | null }),
      (err: unknown) => ({
        data: [],
        error:
          err instanceof Error ? err.message : "Gagal memuat daftar site.",
      }),
    ),
  ]);

  const selectedSite =
    typeof params.site === "string" && UUID_PATTERN.test(params.site)
      ? params.site
      : "";
  const sites = sitesResult.data;
  const showSiteFilter = sites.length > 1 || Boolean(sitesResult.error);

  if (!showSiteFilter) return null;

  return (
    <Form
      action="/tiket"
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-[var(--surface)] p-4 shadow-xs"
    >
      <div>
        <label
          htmlFor="site-filter"
          className="mb-1 block text-xs font-medium text-[var(--muted)]"
        >
          Filter Site
        </label>
        <select
          key={selectedSite}
          id="site-filter"
          name="site"
          defaultValue={selectedSite}
          className="min-w-56 rounded-lg border px-3 py-1.5 text-sm"
        >
          <option value="">Semua site</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.nama}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="min-h-10 rounded-lg border bg-[var(--surface)] px-4 py-1.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
      >
        Terapkan
      </button>
      {selectedSite && (
        <Link
          href="/tiket"
          className="px-2 py-2 text-xs font-medium text-blue-700 hover:underline"
        >
          Hapus filter
        </Link>
      )}
      {sitesResult.error && (
        <p role="alert" className="text-sm text-red-700">
          Gagal memuat pilihan site: {sitesResult.error}
        </p>
      )}
    </Form>
  );
}

async function ActiveTicketsSection({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const [profile, params] = await Promise.all([
    getCurrentUserProfile(),
    searchParams,
  ]);
  if (!profile) redirect("/login");

  const isStaff = profile.peran === "it" || profile.peran === "admin";
  const selectedSite =
    typeof params.site === "string" && UUID_PATTERN.test(params.site)
      ? params.site
      : "";

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error(
      "Konfigurasi Supabase admin tidak tersedia untuk tiket aktif:",
      err instanceof Error ? err.message : err,
    );
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat tiket aktif: Konfigurasi server belum lengkap.
      </p>
    );
  }
  let activeQuery = admin
    .from("tickets")
    .select(
      "id, nomor_tiket, pembuat_id, site_id, status, prioritas, dibuat_pada, categories(nama), sites(nama)",
    )
    .in("status", [...ACTIVE_STATUSES])
    .order("prioritas", { ascending: true })
    .order("dibuat_pada", { ascending: true });
  if (selectedSite) activeQuery = activeQuery.eq("site_id", selectedSite);

  const { data: activeTickets, error: activeError } = await activeQuery;

  if (activeError) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat tiket aktif: {activeError.message}
      </p>
    );
  }

  const boardTickets = (activeTickets ?? []).map((ticket) => ({
    id: ticket.id,
    nomor_tiket: ticket.nomor_tiket,
    prioritas: ticket.prioritas,
    status: ticket.status,
    dibuat_pada: ticket.dibuat_pada,
    kategori: relationName(ticket.categories),
    site: relationName(ticket.sites),
    canOpen: isStaff || ticket.pembuat_id === profile.id,
  }));

  return (
    <TicketBoardClient
      tickets={boardTickets}
      emptyMessage="Tidak ada tiket aktif saat ini."
      showSite
      showDescription={false}
    />
  );
}

async function MyHistorySection() {
  const [profile, supabase] = await Promise.all([
    getCurrentUserProfile(),
    createClient(),
  ]);
  if (!profile) redirect("/login");

  const { data: myHistory, error: historyError } = await supabase
    .from("tickets")
    .select("id, nomor_tiket, status, prioritas, dibuat_pada, categories(nama)")
    .eq("pembuat_id", profile.id)
    .in("status", ["selesai", "ditutup"])
    .order("dibuat_pada", { ascending: false })
    .limit(50);

  return (
    <section className="space-y-3 pt-2">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Riwayat Tiket Saya
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Tiket selesai dan ditutup yang Anda buat.
        </p>
      </div>
      {historyError ? (
        <p role="alert" className="text-sm text-red-700">
          Gagal memuat riwayat tiket: {historyError.message}
        </p>
      ) : !myHistory?.length ? (
        <div className="rounded-xl border bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
          Belum ada tiket yang selesai.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-[var(--surface)] shadow-xs">
          <ul className="divide-y">
            {myHistory.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/tiket/${ticket.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--surface-muted)] sm:px-5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tabular-nums text-[var(--muted)]">
                        {ticket.nomor_tiket}
                      </span>
                      <PrioritasBadge prioritas={ticket.prioritas} />
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {relationName(ticket.categories)}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {formatDate(ticket.dibuat_pada)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function TiketPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <SiteFilterSection searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<BoardSkeleton />}>
        <ActiveTicketsSection searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<HistorySkeleton />}>
        <MyHistorySection />
      </Suspense>
    </>
  );
}
