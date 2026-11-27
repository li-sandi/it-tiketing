import { Suspense } from "react";
import { redirect } from "next/navigation";
import SitesTable from "@/components/admin/SitesTable";
import { getCurrentUserProfile } from "@/lib/auth";
import { getAllSites } from "@/lib/data/sites";

function AdminSitesSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border bg-[var(--surface)] p-4">
      <div className="h-10 rounded bg-[var(--surface-muted)]" />
      <div className="h-12 rounded bg-[var(--surface-muted)]" />
      <div className="h-12 rounded bg-[var(--surface-muted)]" />
    </div>
  );
}

async function AdminSitesContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");

  let sites: Awaited<ReturnType<typeof getAllSites>> = [];
  let errorMessage: string | null = null;
  try {
    sites = await getAllSites();
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Terjadi kesalahan saat memuat site.";
  }

  if (errorMessage) {
    return (
      <p role="alert" className="text-red-700">
        Gagal memuat daftar site: {errorMessage}
      </p>
    );
  }

  return <SitesTable sites={sites} />;
}

export default function AdminSitesPage() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Kelola Site</h1>
      <p className="mb-6 text-sm text-gray-600">
        Fokus saat ini: satu entitas aktif <strong>Debito Jogja</strong> (400
        user). Nilai jumlah user dipakai untuk perhitungan kenaikan otomatis
        prioritas P0 (&gt;50% user terdampak).
      </p>
      <Suspense fallback={<AdminSitesSkeleton />}>
        <AdminSitesContent />
      </Suspense>
    </section>
  );
}
