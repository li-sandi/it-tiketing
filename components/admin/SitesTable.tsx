"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Site = {
  id: string;
  nama: string;
  jumlah_user: number;
  punya_it: boolean;
  aktif: boolean;
};

export default function SitesTable({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userCounts, setUserCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(sites.map((s) => [s.id, s.jumlah_user])),
  );

  const [newNama, setNewNama] = useState("");
  const [newUsers, setNewUsers] = useState("100");
  const [newPunyaIt, setNewPunyaIt] = useState(true);
  const [creating, setCreating] = useState(false);

  async function patchSite(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sites/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal memperbarui site.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui site.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: newNama,
          jumlah_user: Number(newUsers),
          punya_it: newPunyaIt,
          aktif: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal menambah site.");
      setNewNama("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah site.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs"
      >
        <div>
          <label htmlFor="new-site-name" className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Nama Site Baru
          </label>
          <input
            id="new-site-name"
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            required
            className="rounded-lg border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-site-users" className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Jumlah User
          </label>
          <input
            id="new-site-users"
            type="number"
            min={0}
            value={newUsers}
            onChange={(e) => setNewUsers(e.target.value)}
            required
            className="w-28 rounded-lg border px-3 py-1.5 text-sm tabular-nums"
          />
        </div>
        <label className="flex items-center gap-2 py-2 text-sm text-[var(--secondary)]">
          <input
            type="checkbox"
            checked={newPunyaIt}
            onChange={(e) => setNewPunyaIt(e.target.checked)}
          />
          Ada IT Lokal
        </label>
        <button
          type="submit"
          disabled={creating}
          className="ml-auto min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
        >
          {creating ? "Menyimpan..." : "Tambah Site"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-[var(--surface)] shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Nama Site</th>
              <th className="px-4 py-3 font-medium">Jumlah User</th>
              <th className="px-4 py-3 font-medium">IT Lokal</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sites.map((site) => (
              <tr
                key={site.id}
                className={
                  site.aktif
                    ? "hover:bg-[var(--surface-muted)]"
                    : "bg-[var(--surface-muted)] opacity-60"
                }
              >
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                  {site.nama}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`Jumlah user ${site.nama}`}
                      type="number"
                      min={0}
                      value={userCounts[site.id] ?? site.jumlah_user}
                      onChange={(e) =>
                        setUserCounts((prev) => ({
                          ...prev,
                          [site.id]: Number(e.target.value),
                        }))
                      }
                      className="w-24 rounded-lg border px-2.5 py-1 text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() =>
                        void patchSite(site.id, {
                          jumlah_user: userCounts[site.id] ?? site.jumlah_user,
                        })
                      }
                      className="rounded-lg border bg-[var(--surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
                    >
                      Simpan
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void patchSite(site.id, { punya_it: !site.punya_it })
                    }
                    className="rounded-lg border bg-[var(--surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
                  >
                    {site.punya_it ? "Ya" : "Tidak"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void patchSite(site.id, { aktif: !site.aktif })
                    }
                    className={`rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                      site.aktif
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {site.aktif ? "Aktif" : "Nonaktif"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
