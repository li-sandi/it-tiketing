import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import GenerateJadwalClient from "@/components/admin/GenerateJadwalClient";
import { getCurrentUserProfile } from "@/lib/auth";
import { getUpcomingSlemanSchedule } from "@/lib/data/schedule";
import { getAllSites } from "@/lib/data/sites";
import { getItStaffList } from "@/lib/data/users";
import { getJakartaDate } from "@/lib/jadwal-sleman";
import { getFeatureFlags } from "@/lib/settings";

const DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeZone: "UTC",
});
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  timeZone: "UTC",
});

function toUtcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function AdminJadwalSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-16 rounded-xl border bg-[var(--surface)]" />
      <div className="h-56 rounded-xl border bg-[var(--surface)]" />
    </div>
  );
}

async function AdminJadwalContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");

  await connection();
  const today = getJakartaDate();

  const [jadwalResult, itStaffResult, allSitesResult, flags] =
    await Promise.all([
      getUpcomingSlemanSchedule(today).then(
        (data) => ({ data, error: null as string | null }),
        (err: unknown) => ({
          data: [],
          error:
            err instanceof Error
              ? err.message
              : "Gagal memuat jadwal kunjungan.",
        }),
      ),
      getItStaffList().catch(() => []),
      getAllSites().catch(() => []),
      getFeatureFlags(),
    ]);

  if (jadwalResult.error) {
    console.error("Gagal memuat jadwal kunjungan:", jadwalResult.error);
    return (
      <p role="alert" className="text-red-700">
        Gagal memuat jadwal. Silakan muat ulang halaman.
      </p>
    );
  }

  const jadwal = jadwalResult.data;
  const itStaff = itStaffResult;
  const remoteSites = allSitesResult
    .filter((site) => !site.punya_it)
    .map((site) => ({ id: site.id, nama: site.nama }));
  const namaPetugas = new Map(itStaff.map((user) => [user.id, user.nama]));

  return (
    <>
      {!flags.sleman_routing_enabled && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Routing kunjungan saat ini <strong>dinonaktifkan</strong> karena
          sistem fokus pada 1 site (Debito Jogja). Anda dapat mengaktifkannya di{" "}
          <strong>Admin → Pengaturan</strong> bila site tambahan mulai beroperasi.
        </p>
      )}
      <p className="mb-6 text-sm text-gray-600">
        Jadwal Selasa dan Kamis dibuat bergantian per minggu untuk 8 minggu
        berdasarkan daftar petugas IT aktif.
      </p>
      <GenerateJadwalClient itStaff={itStaff} sites={remoteSites} />

      <div className="overflow-hidden rounded border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-100">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Hari</th>
                <th className="px-4 py-3">Petugas</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jadwal.map((item) => {
                const date = toUtcDate(item.tanggal);
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      {DATE_FORMATTER.format(date)}
                    </td>
                    <td className="px-4 py-3">
                      {WEEKDAY_FORMATTER.format(date)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {namaPetugas.get(item.it_id) ?? "Petugas tidak ditemukan"}
                    </td>
                  </tr>
                );
              })}
              {!jadwal.length && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-gray-600"
                  >
                    Belum ada jadwal kunjungan mendatang.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function AdminJadwalPage() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Jadwal Kunjungan Multi-Site</h1>
      <Suspense fallback={<AdminJadwalSkeleton />}>
        <AdminJadwalContent />
      </Suspense>
    </section>
  );
}
