import { Suspense } from "react";
import { redirect } from "next/navigation";
import TicketForm from "@/components/tiket/TicketForm";
import { getCurrentUserProfile } from "@/lib/auth";
import { getActiveCategories } from "@/lib/data/categories";
import { getActiveSites, getSiteById } from "@/lib/data/sites";
import { getInventoryStocks } from "@/lib/data/stocks";

function NewTicketFormSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-28 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-16 rounded-lg bg-[var(--surface-muted)]" />
      <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
    </div>
  );
}

async function NewTicketFormLoader() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");

  const isItOrAdmin = profile.peran === "it" || profile.peran === "admin";
  const [categoriesResult, stocksResult, siteResult] = await Promise.allSettled([
    getActiveCategories({ includeInternal: isItOrAdmin }),
    getInventoryStocks(),
    profile.site_id ? getSiteById(profile.site_id) : getActiveSites(),
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

  let siteId = profile.site_id;
  let jumlahUserSite = 400;
  if (siteResult.status === "fulfilled") {
    if (Array.isArray(siteResult.value)) {
      const defaultSite = siteResult.value[0];
      if (defaultSite) {
        siteId = defaultSite.id;
        jumlahUserSite = defaultSite.jumlah_user;
      }
    } else if (siteResult.value) {
      jumlahUserSite = siteResult.value.jumlah_user;
    }
  }

  const categories = categoriesResult.value;
  const stocks = stocksResult.status === "fulfilled" ? stocksResult.value : [];

  if (!categories.length) {
    return (
      <p className="rounded-lg border bg-[var(--surface-muted)] p-4 text-sm text-[var(--secondary)]">
        Belum ada kategori aktif. Hubungi admin untuk mengaktifkan kategori.
      </p>
    );
  }

  return (
    <TicketForm
      categories={categories}
      stocks={stocks}
      userId={profile.id}
      siteId={siteId}
      jumlahUserSite={jumlahUserSite}
    />
  );
}

export default function NewTicketPage() {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-7">
      <Suspense fallback={<NewTicketFormSkeleton />}>
        <NewTicketFormLoader />
      </Suspense>
    </div>
  );
}
