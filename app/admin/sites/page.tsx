import SitesTable from "@/components/admin/SitesTable";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminSitesPage() {
  const admin = createAdminClient();
  const { data: sites, error } = await admin
    .from("sites")
    .select("id, nama, jumlah_user, punya_it, aktif")
    .order("nama");

  if (error) {
    return (
      <section>
        <h1 className="mb-4 text-2xl font-bold">Kelola Site</h1>
        <p role="alert" className="text-red-700">
          Gagal memuat daftar site: {error.message}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Kelola Site</h1>
      <p className="mb-6 text-sm text-gray-600">
        Fokus saat ini: satu entitas aktif <strong>Debito Jogja</strong> (400
        user). Nilai jumlah user dipakai untuk perhitungan kenaikan otomatis
        prioritas P0 (&gt;50% user terdampak).
      </p>
      <SitesTable sites={sites ?? []} />
    </section>
  );
}
