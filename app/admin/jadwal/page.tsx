import GenerateJadwalClient from "@/components/admin/GenerateJadwalClient";
import { getJakartaDate } from "@/lib/jadwal-sleman";
import { getFeatureFlags } from "@/lib/settings";
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
  const [
    { data: jadwal, error: jadwalError },
    { data: itStaff },
    { data: remoteSites },
    flags,
  ] = await Promise.all([
    admin
      .from("it_schedule")
      .select("id, tanggal, it_id")
      .eq("jenis", "kunjungan_sleman")
      .gte("tanggal", getJakartaDate())
      .order("tanggal", { ascending: true }),
    admin.from("users").select("id, nama").eq("peran", "it").order("nama"),
    admin
      .from("sites")
      .select("id, nama")
      .eq("punya_it", false)
      .order("nama"),
    getFeatureFlags(),
  ]);

  if (jadwalError) {
    console.error("Gagal memuat jadwal kunjungan:", jadwalError.message);
    return (
      <section>
        <h1 className="mb-6 text-2xl font-bold">Jadwal Kunjungan</h1>
        <p role="alert" className="text-red-700">
          Gagal memuat jadwal. Silakan muat ulang halaman.
        </p>
      </section>
    );
  }

  const itIds = [...new Set((jadwal ?? []).map((item) => item.it_id))];
  const { data: petugas } = itIds.length
    ? await admin.from("users").select("id, nama").in("id", itIds)
    : { data: [] };

  const namaPetugas = new Map(
    (petugas ?? []).map((user) => [user.id, user.nama]),
  );

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Jadwal Kunjungan Multi-Site</h1>
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
      <GenerateJadwalClient
        itStaff={itStaff ?? []}
        sites={remoteSites ?? []}
      />

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
                    Belum ada jadwal kunjungan mendatang.
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
