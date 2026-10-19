import Link from "next/link";
import { connection } from "next/server";
import PublicTicketForm from "@/components/tiket/PublicTicketForm";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;

export default async function LaporPage() {
  await connection();
  const admin = createAdminClient();
  const [
    { data: categories, error: categoriesError },
    { data: sites, error: sitesError },
  ] = await Promise.all([
    admin
      .from("categories")
      .select(
        "id, nama, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote",
      )
      .eq("aktif", true)
      .order("nama"),
    admin.from("sites").select("id, nama, jumlah_user").order("nama"),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="rounded-lg border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <Link href="/" className="text-sm text-gray-600 hover:underline">
            ← Beranda
          </Link>
          <h1 className="mt-3 text-2xl font-bold">Buat Tiket Baru</h1>
          <p className="mt-2 text-sm text-gray-600">
            Isi data masalah. Setelah tiket dibuat, simpan link rahasia untuk
            melihat status dan riwayat tiket.
          </p>
        </div>

        {categoriesError ? (
          <p role="alert" className="text-red-700">
            Gagal memuat kategori: {categoriesError.message}
          </p>
        ) : sitesError ? (
          <p role="alert" className="text-red-700">
            Gagal memuat site: {sitesError.message}
          </p>
        ) : !categories?.length || !sites?.length ? (
          <p className="rounded border p-4 text-gray-700">
            Kategori aktif atau data site belum tersedia.
          </p>
        ) : (
          <PublicTicketForm categories={categories} sites={sites} />
        )}
      </div>
    </main>
  );
}
