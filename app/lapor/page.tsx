import Link from "next/link";
import { connection } from "next/server";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicTicketForm from "@/components/tiket/PublicTicketForm";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;

export default async function PublicReportPage() {
  await connection();
  const admin = createAdminClient();
  const [
    { data: categories, error: categoriesError },
    { data: sites, error: sitesError },
    { data: stocks },
  ] = await Promise.all([
    admin
      .from("categories")
      .select(
        "id, nama, grup, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote, stock_kode",
      )
      .eq("aktif", true)
      .neq("tipe", "internal")
      .order("grup")
      .order("nama"),
    admin
      .from("sites")
      .select("id, nama, jumlah_user")
      .eq("aktif", true)
      .order("nama"),
    admin
      .from("inventory_stocks")
      .select("id, kode, nama, satuan, jumlah_stok, stok_minimum, catatan")
      .order("nama"),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <PublicHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
        <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-8">
          <div className="mb-6 border-b pb-5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Kembali ke Beranda
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Buat Tiket Layanan IT
            </h1>
            <p className="mt-1.5 text-sm text-[var(--secondary)]">
              Lengkapi formulir di bawah ini. Setelah terkirim, Anda akan menerima tautan
              khusus untuk memantau perkembangan penanganan.
            </p>
          </div>

          {categoriesError ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              Gagal memuat kategori: {categoriesError.message}
            </p>
          ) : sitesError ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              Gagal memuat site: {sitesError.message}
            </p>
          ) : !categories?.length || !sites?.length ? (
            <p className="rounded-lg border bg-[var(--surface-muted)] p-4 text-sm text-[var(--secondary)]">
              Kategori aktif atau data site belum tersedia.
            </p>
          ) : (
            <PublicTicketForm
              categories={categories}
              sites={sites}
              stocks={stocks ?? []}
            />
          )}
        </div>
      </main>
    </div>
  );
}
