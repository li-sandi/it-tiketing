import GenerateJadwalClient from "@/components/admin/GenerateJadwalClient";
import { getJakartaDate } from "@/lib/jadwal-sleman";
import { createAdminClient } from "@/lib/supabase/admin";
import { connection } from "next/server";

export const instant = false;

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

export default async function AdminJadwalPage() {
  await connection();
  const admin = createAdminClient();
  const { data: jadwal, error: jadwalError } = await admin
    .from("it_schedule")
    .select("id, tanggal, it_id")
    .eq("jenis", "kunjungan_sleman")
    .gte("tanggal", getJakartaDate())
    .order("tanggal", { ascending: true });

  if (jadwalError) {
    console.error("Gagal memuat jadwal kunjungan Sleman:", jadwalError.message);
    return (
      <section>
        <h1 className="mb-6 text-2xl font-bold">Jadwal Kunjungan Sleman</h1>
        <p role="alert" className="text-red-700">
          Gagal memuat jadwal. Silakan muat ulang halaman.
        </p>
      </section>
    );
  }

  const itIds = [...new Set((jadwal ?? []).map((item) => item.it_id))];
  const { data: petugas, error: petugasError } = itIds.length
    ? await admin.from("users").select("id, nama").in("id", itIds)
    : { data: [], error: null };

  if (petugasError) {
    console.error("Gagal memuat petugas jadwal:", petugasError.message);
    return (
      <section>
        <h1 className="mb-6 text-2xl font-bold">Jadwal Kunjungan Sleman</h1>
        <p role="alert" className="text-red-700">
          Gagal memuat nama petugas. Silakan muat ulang halaman.
        </p>
      </section>
    );
  }

  const namaPetugas = new Map(
    (petugas ?? []).map((user) => [user.id, user.nama]),
  );

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Jadwal Kunjungan Sleman</h1>
      <p className="mb-6 text-sm text-gray-600">
        Jadwal Selasa dan Kamis dibuat bergantian per minggu untuk 8 minggu.
        Routing tiket onsite Sleman bergantung pada jadwal aktif di bawah ini.
      </p>
      <GenerateJadwalClient />

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
              {(jadwal ?? []).map((item) => {
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
              {!jadwal?.length && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-gray-600"
                  >
                    Belum ada jadwal kunjungan mendatang. Routing otomatis
                    Sleman belum siap sampai admin membuat jadwal di atas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
