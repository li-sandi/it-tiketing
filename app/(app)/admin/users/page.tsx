import { Suspense } from "react";
import { redirect } from "next/navigation";
import UserTable from "@/components/admin/UserTable";
import { getCurrentUserProfile } from "@/lib/auth";
import { getAllSites } from "@/lib/data/sites";
import { getAllUsersAdmin } from "@/lib/data/users";

function AdminUsersSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border bg-[var(--surface)] p-4">
      <div className="h-10 rounded bg-[var(--surface-muted)]" />
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="h-12 rounded bg-[var(--surface-muted)]" />
      ))}
    </div>
  );
}

async function AdminUsersContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");

  const [usersResult, sitesResult] = await Promise.allSettled([
    getAllUsersAdmin(),
    getAllSites(),
  ]);

  if (usersResult.status === "rejected" || sitesResult.status === "rejected") {
    const error =
      usersResult.status === "rejected"
        ? usersResult.reason
        : sitesResult.status === "rejected"
          ? sitesResult.reason
          : null;
    console.error(
      "Gagal memuat data user admin:",
      error instanceof Error ? error.message : error,
    );
    return (
      <p role="alert" className="text-red-700">
        Gagal memuat user atau site. Silakan muat ulang halaman.
      </p>
    );
  }

  return (
    <UserTable
      users={usersResult.value}
      sites={sitesResult.value.map((s) => ({ id: s.id, nama: s.nama }))}
    />
  );
}

export default function AdminUsersPage() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Kelola User</h1>
      <p className="mb-6 text-sm text-gray-600">
        Perubahan peran dan site langsung berlaku pada akun.
      </p>
      <Suspense fallback={<AdminUsersSkeleton />}>
        <AdminUsersContent />
      </Suspense>
    </section>
  );
}
