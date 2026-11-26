"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type User = {
  id: string;
  nama: string;
  email: string;
  peran: "user" | "it" | "admin" | "ga";
  site_id: string | null;
};

type Site = { id: string; nama: string };

export default function UserTable({
  users,
  sites,
}: {
  users: User[];
  sites: Site[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateUser(
    id: string,
    field: "peran" | "site_id",
    value: string,
  ) {
    setLoadingId(id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value || null }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Gagal mengubah user.");
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Gagal mengubah user.",
      );
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-[var(--surface)] shadow-xs">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Nama &amp; Email</th>
              <th className="px-4 py-3 font-medium">Peran</th>
              <th className="px-4 py-3 font-medium">Site</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr
                key={user.id}
                className={
                  loadingId === user.id
                    ? "opacity-50"
                    : "hover:bg-[var(--surface-muted)]"
                }
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-[var(--foreground)]">{user.nama}</div>
                  <div className="text-xs text-[var(--muted)]">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Peran ${user.nama}`}
                    value={user.peran}
                    disabled={loadingId !== null}
                    onChange={(event) =>
                      void updateUser(user.id, "peran", event.target.value)
                    }
                    className="rounded-lg border px-2.5 py-1 text-sm"
                  >
                    <option value="user">User</option>
                    <option value="it">IT</option>
                    <option value="ga">GA</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Site ${user.nama}`}
                    value={user.site_id ?? ""}
                    disabled={loadingId !== null}
                    onChange={(event) =>
                      void updateUser(user.id, "site_id", event.target.value)
                    }
                    className="rounded-lg border px-2.5 py-1 text-sm"
                  >
                    <option value="">Tidak ada site</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.nama}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[var(--muted)]">
                  Belum ada user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
