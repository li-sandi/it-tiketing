import KategoriTable from "@/components/admin/KategoriTable";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminKategoriPage() {
  const admin = createAdminClient();
  const { data: categories, error } = await admin
    .from("categories")
    .select(
      "id, nama, tipe, prioritas_default, butuh_aset, butuh_foto, bisa_remote, aktif",
    )
    .order("nama");

  if (error) {
    console.error("Gagal memuat kategori admin:", error.message);
    return (
      <section>
        <h1 className="mb-6 text-2xl font-bold">Kelola Kategori</h1>
        <p role="alert" className="text-red-700">
          Gagal memuat kategori. Silakan muat ulang halaman.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Kelola Kategori</h1>
      <p className="mb-6 text-sm text-gray-600">
        Aktif/nonaktif kategori akan memengaruhi pilihan pada form tiket baru.
      </p>
      <KategoriTable categories={categories ?? []} />
    </section>
  );
}
