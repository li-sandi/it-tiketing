import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardLoading from "@/app/(app)/dashboard/loading";
import ItStatusToggle from "@/components/it/ItStatusToggle";
import BrowserNotificationToggle from "@/components/notifications/BrowserNotificationToggle";
import HubungkanTelegram from "@/components/telegram/HubungkanTelegram";
import { getCurrentUserProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function DashboardContent() {
  const [profile, supabase] = await Promise.all([
    getCurrentUserProfile(),
    createClient(),
  ]);
  if (!profile) redirect("/login");

  const userName = profile.nama ?? profile.email ?? "Pengguna";
  const peran = profile.peran ?? "user";
  const isStaff = peran === "it" || peran === "admin";
  const isAssetOrApproval = isStaff || peran === "ga";

  const [
    { count: myActiveCount },
    { data: myPendingRating },
    { count: queueCount },
    { count: myAssignedCount },
    { count: procurementCount },
    { data: itStatusRow },
    { data: pendingApprovals },
  ] = await Promise.all([
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("pembuat_id", profile.id)
      .in("status", [
        "baru",
        "diproses",
        "menunggu_user",
        "dijadwalkan_kunjungan",
        "menunggu_pengadaan",
      ]),
    supabase
      .from("tickets")
      .select("id, nomor_tiket, categories(nama)")
      .eq("pembuat_id", profile.id)
      .eq("status", "selesai")
      .limit(5),
    isStaff
      ? supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("status", "baru")
          .is("it_id", null)
      : Promise.resolve({ count: 0 }),
    isStaff
      ? supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("it_id", profile.id)
          .in("status", ["diproses", "menunggu_user", "menunggu_pengadaan"])
      : Promise.resolve({ count: 0 }),
    isAssetOrApproval
      ? supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("status", "menunggu_pengadaan")
      : Promise.resolve({ count: 0 }),
    peran === "it"
      ? supabase
          .from("it_status")
          .select("status")
          .eq("it_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    peran === "ga" || peran === "admin"
      ? supabase
          .from("tickets")
          .select("id, nomor_tiket, deskripsi, categories(nama)")
          .eq("approval_status", "menunggu")
          .order("dibuat_pada", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {peran === "it" ? (
          <ItStatusToggle initialStatus={itStatusRow?.status ?? "free"} />
        ) : (
          <div className="text-sm text-[var(--secondary)]">
            Masuk sebagai <strong className="text-[var(--foreground)]">{userName}</strong>{" "}
            <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold uppercase text-[var(--muted)]">
              {peran}
            </span>
          </div>
        )}
        <BrowserNotificationToggle />
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
          <p className="text-xs font-medium text-[var(--muted)]">Tiket Aktif Saya</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {myActiveCount ?? 0}
          </p>
          <Link href="/tiket" className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">
            Lihat daftar tiket
          </Link>
        </div>

        {isStaff && (
          <>
            <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
              <p className="text-xs font-medium text-[var(--muted)]">
                Antrian Baru (Belum Diambil)
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--foreground)]">
                {queueCount ?? 0}
              </p>
              <Link href="/antrian" className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">
                Buka antrian IT
              </Link>
            </div>
            <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
              <p className="text-xs font-medium text-[var(--muted)]">
                Sedang Saya Tangani
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--foreground)]">
                {myAssignedCount ?? 0}
              </p>
              <Link href="/antrian" className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">
                Kelola pekerjaan
              </Link>
            </div>
          </>
        )}

        {isAssetOrApproval && (
          <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
            <p className="text-xs font-medium text-[var(--muted)]">
              Menunggu Pengadaan Sparepart
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--foreground)]">
              {procurementCount ?? 0}
            </p>
            <Link href="/stok" className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">
              Pantau stok &amp; pengadaan
            </Link>
          </div>
        )}
      </section>

      {myPendingRating && myPendingRating.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-xs sm:p-5">
          <h2 className="text-sm font-semibold text-amber-950">
            Menunggu Konfirmasi &amp; Rating Anda ({myPendingRating.length})
          </h2>
          <ul className="mt-2.5 space-y-1.5 text-sm">
            {myPendingRating.map((t) => {
              const cat = Array.isArray(t.categories)
                ? t.categories[0]?.nama
                : (t.categories as { nama?: string } | null)?.nama;
              return (
                <li key={t.id}>
                  <Link
                    href={`/tiket/${t.id}`}
                    className="font-medium text-amber-900 underline hover:text-amber-950"
                  >
                    {t.nomor_tiket} · {cat ?? "Tiket"} (beri rating)
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pendingApprovals && pendingApprovals.length > 0 && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-xs sm:p-5">
          <h2 className="text-sm font-semibold text-blue-900">
            Menunggu Persetujuan GA / Admin ({pendingApprovals.length})
          </h2>
          <ul className="mt-2.5 space-y-1.5 text-sm">
            {pendingApprovals.map((t) => {
              const cat = Array.isArray(t.categories)
                ? t.categories[0]?.nama
                : (t.categories as { nama?: string } | null)?.nama;
              return (
                <li key={t.id}>
                  <Link
                    href={`/tiket/${t.id}`}
                    className="font-medium text-blue-800 underline hover:text-blue-950"
                  >
                    {t.nomor_tiket} · {cat ?? "Permintaan"}:{" "}
                    {t.deskripsi.slice(0, 80)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <HubungkanTelegram
            botUsername={process.env.TELEGRAM_BOT_USERNAME ?? ""}
            sudahTerhubung={Boolean(profile.telegram_id)}
          />
        </div>

        <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Pintasan Layanan Cepat
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Akses cepat ke panduan mandiri dan modul yang relevan dengan peran Anda.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href="/wiki"
              className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface-muted)] px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--border)]"
            >
              Wiki &amp; SOP
            </Link>
            {isStaff && (
              <Link
                href="/laporan"
                className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface-muted)] px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--border)]"
              >
                Laporan &amp; Beban Kerja
              </Link>
            )}
            {isAssetOrApproval && (
              <>
                <Link
                  href="/aset"
                  className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface-muted)] px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--border)]"
                >
                  Inventaris Aset
                </Link>
                <Link
                  href="/stok"
                  className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface-muted)] px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--border)]"
                >
                  Stok Sparepart
                </Link>
              </>
            )}
            {peran === "admin" && (
              <Link
                href="/admin"
                className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface-muted)] px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--border)]"
              >
                Admin Panel
              </Link>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
