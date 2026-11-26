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
        className="flex flex-wrap items-end gap-3 rounded border bg-white p-4"
      >
        <div>
          <label htmlFor="new-site-name" className="mb-1 block text-xs font-medium">
            Nama Site Baru
          </label>
          <input
            id="new-site-name"
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            required
            className="rounded border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-site-users" className="mb-1 block text-xs font-medium">
            Jumlah User
          </label>
          <input
            id="new-site-users"
            type="number"
            min={0}
            value={newUsers}
            onChange={(e) => setNewUsers(e.target.value)}
            required
            className="w-28 rounded border px-3 py-1.5 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 py-1.5 text-sm">
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
          className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {creating ? "Menyimpan..." : "+ Tambah Site"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-100">
            <tr>
              <th className="px-4 py-3">Nama Site</th>
              <th className="px-4 py-3">Jumlah User</th>
              <th className="px-4 py-3">IT Lokal</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sites.map((site) => (
              <tr key={site.id} className={site.aktif ? "" : "bg-gray-50 opacity-60"}>
                <td className="px-4 py-3 font-medium">{site.nama}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={userCounts[site.id] ?? site.jumlah_user}
                      onChange={(e) =>
                        setUserCounts((prev) => ({
                          ...prev,
                          [site.id]: Number(e.target.value),
                        }))
                      }
                      className="w-24 rounded border px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() =>
                        void patchSite(site.id, {
                          jumlah_user: userCounts[site.id] ?? site.jumlah_user,
                        })
                      }
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
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
                    className="rounded border px-2.5 py-1 text-xs"
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
                    className={`rounded px-3 py-1 text-xs font-medium ${
                      site.aktif
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-200 text-gray-700"
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
