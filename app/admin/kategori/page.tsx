import KategoriTable from "@/components/admin/KategoriTable";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminKategoriPage() {
  const admin = createAdminClient();
  const [{ data: categories, error }, { data: stockOptions }] = await Promise.all([
    admin
      .from("categories")
      .select(
        "id, nama, grup, tipe, prioritas_default, butuh_aset, butuh_foto, bisa_remote, butuh_approval, aktif, stock_kode",
      )
      .order("grup")
      .order("nama"),
    admin
      .from("inventory_stocks")
      .select("kode, nama")
      .order("nama"),
  ]);

  if (error) {
    console.error("Gagal memuat kategori admin:", error.message);
    return (
      <section>
        <h1 className="mb-6 text-2xl font-bold">Kelola Kategori</h1>
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memuat kategori. Silakan muat ulang halaman.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--foreground)]">Kelola Kategori</h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">
          Tambah kategori, ubah kelompok (Network &amp; VPN, Hardware &amp; Periferal,
          Software &amp; Aplikasi, Laptop Lifecycle &amp; Performa, Akses &amp; Keamanan,
          Internal IT), prioritas default, relasi stok sparepart, dan persyaratan formulir.
        </p>
      </div>
      <KategoriTable
        categories={categories ?? []}
        stockOptions={stockOptions ?? []}
      />
    </section>
  );
}
