import { Suspense } from "react";
import Link from "next/link";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicTicketForm from "@/components/tiket/PublicTicketForm";
import { getActiveCategories } from "@/lib/data/categories";
import { getActiveSites } from "@/lib/data/sites";
import { getInventoryStocks } from "@/lib/data/stocks";

function LaporFormSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-28 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-24 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
    </div>
  );
}

async function PublicReportFormLoader() {
  const [categoriesResult, sitesResult, stocksResult] = await Promise.allSettled([
    getActiveCategories({ includeInternal: false }),
    getActiveSites(),
    getInventoryStocks(),
  ]);

  if (categoriesResult.status === "rejected") {
    const message =
      categoriesResult.reason instanceof Error
        ? categoriesResult.reason.message
        : "Terjadi kesalahan saat memuat kategori.";
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat kategori: {message}
      </p>
    );
  }

  if (sitesResult.status === "rejected") {
    const message =
      sitesResult.reason instanceof Error
        ? sitesResult.reason.message
        : "Terjadi kesalahan saat memuat site.";
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat site: {message}
      </p>
    );
  }

  const categories = categoriesResult.value;
  const sites = sitesResult.value;
  const stocks = stocksResult.status === "fulfilled" ? stocksResult.value : [];

  if (!categories.length || !sites.length) {
    return (
      <p className="rounded-lg border bg-[var(--surface-muted)] p-4 text-sm text-[var(--secondary)]">
        Kategori aktif atau data site belum tersedia.
      </p>
    );
  }

  return (
    <PublicTicketForm
      categories={categories}
      sites={sites}
      stocks={stocks}
    />
  );
}

export default function PublicReportPage() {
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

          <Suspense fallback={<LaporFormSkeleton />}>
            <PublicReportFormLoader />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
