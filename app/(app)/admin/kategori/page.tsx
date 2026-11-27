import { Suspense } from "react";
import { redirect } from "next/navigation";
import KategoriTable from "@/components/admin/KategoriTable";
import { getCurrentUserProfile } from "@/lib/auth";
import { getAllCategories } from "@/lib/data/categories";
import { getInventoryStocks } from "@/lib/data/stocks";

function AdminKategoriSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border bg-[var(--surface)] p-4">
      <div className="h-10 rounded bg-[var(--surface-muted)]" />
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="h-12 rounded bg-[var(--surface-muted)]" />
      ))}
    </div>
  );
}

async function AdminKategoriContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");

  const [categoriesResult, stocksResult] = await Promise.allSettled([
    getAllCategories(),
    getInventoryStocks(),
  ]);

  if (categoriesResult.status === "rejected") {
    console.error(
      "Gagal memuat kategori admin:",
      categoriesResult.reason instanceof Error
        ? categoriesResult.reason.message
        : categoriesResult.reason,
    );
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat kategori. Silakan muat ulang halaman.
      </p>
    );
  }

  const stockOptions =
    stocksResult.status === "fulfilled"
      ? stocksResult.value.map((s) => ({ kode: s.kode, nama: s.nama }))
      : [];

  return (
    <KategoriTable
      categories={categoriesResult.value}
      stockOptions={stockOptions}
    />
  );
}

export default function AdminKategoriPage() {
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
      <Suspense fallback={<AdminKategoriSkeleton />}>
        <AdminKategoriContent />
      </Suspense>
    </section>
  );
}
