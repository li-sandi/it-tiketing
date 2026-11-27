import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function AdminAuditSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border bg-[var(--surface)] p-4">
      <div className="h-10 rounded bg-[var(--surface-muted)]" />
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="h-12 rounded bg-[var(--surface-muted)]" />
      ))}
    </div>
  );
}

async function AdminAuditContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: logs, error } = await admin
    .from("admin_audit_logs")
    .select(
      "id, aktor_id, aksi, entitas, entitas_id, ringkasan, dibuat_pada, users:aktor_id(nama, email)",
    )
    .order("dibuat_pada", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat audit log: {error.message}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-[var(--surface)] shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">Waktu (WIB)</th>
            <th className="px-4 py-3 font-medium">Admin</th>
            <th className="px-4 py-3 font-medium">Entitas</th>
            <th className="px-4 py-3 font-medium">Aksi</th>
            <th className="px-4 py-3 font-medium">Ringkasan</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {(logs ?? []).map((row) => {
            const actor = Array.isArray(row.users)
              ? row.users[0]
              : (row.users as { nama?: string; email?: string } | null);
            return (
              <tr key={row.id} className="hover:bg-[var(--surface-muted)]">
                <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-[var(--muted)]">
                  {formatDate(row.dibuat_pada)}
                </td>
                <td className="px-4 py-3 text-xs">
                  <p className="font-medium text-[var(--foreground)]">
                    {actor?.nama ?? "Admin"}
                  </p>
                  {actor?.email && (
                    <p className="text-[var(--muted)]">{actor.email}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-medium capitalize text-[var(--secondary)]">
                  {row.entitas}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md border bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold uppercase text-[var(--foreground)]">
                    {row.aksi}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--foreground)]">
                  {row.ringkasan}
                </td>
              </tr>
            );
          })}
          {(!logs || logs.length === 0) && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                Belum ada aktivitas administrasi tercatat.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminAuditPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--foreground)]">
          Audit Log Administrasi
        </h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">
          Rekaman perubahan kategori, site, peran pengguna, dan pengaturan sistem oleh admin.
        </p>
      </div>

      <Suspense fallback={<AdminAuditSkeleton />}>
        <AdminAuditContent />
      </Suspense>
    </section>
  );
}
