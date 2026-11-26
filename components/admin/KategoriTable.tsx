"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Category = {
  id: string;
  nama: string;
  grup: string;
  tipe: "insiden" | "permintaan" | "internal";
  prioritas_default: "P0" | "P1" | "P2" | "P3";
  butuh_aset: boolean;
  butuh_foto: boolean;
  bisa_remote: boolean;
  butuh_approval: boolean;
  aktif: boolean;
};

const DEFAULT_GROUPS = [
  "Network & VPN",
  "Hardware & Periferal",
  "Software & Aplikasi",
  "Laptop Lifecycle & Performa",
  "Akses & Keamanan",
  "Internal IT",
  "Lainnya",
];

export default function KategoriTable({
  categories,
}: {
  categories: Category[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nama, setNama] = useState("");
  const [grup, setGrup] = useState("Software");
  const [tipe, setTipe] = useState<"insiden" | "permintaan" | "internal">("insiden");
  const [prioritas, setPrioritas] = useState<"P0" | "P1" | "P2" | "P3">("P2");
  const [butuhAset, setButuhAset] = useState(false);
  const [butuhFoto, setButuhFoto] = useState(false);
  const [bisaRemote, setBisaRemote] = useState(true);
  const [butuhApproval, setButuhApproval] = useState(false);
  const [creating, setCreating] = useState(false);

  async function patchCategory(id: string, body: Record<string, unknown>) {
    setLoadingId(id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/kategori/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Gagal mengubah kategori.");
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Gagal mengubah kategori.",
      );
    } finally {
      setLoadingId(null);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/kategori", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama,
          grup,
          tipe,
          prioritas_default: prioritas,
          butuh_aset: butuhAset,
          butuh_foto: butuhFoto,
          bisa_remote: bisaRemote,
          butuh_approval: butuhApproval,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Gagal menambah kategori.");
      setNama("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah kategori.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded border bg-white p-4"
      >
        <h2 className="font-semibold">Tambah Kategori Baru</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Nama kategori"
            required
            className="rounded border px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            value={grup}
            onChange={(e) => setGrup(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          >
            {DEFAULT_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={tipe}
              onChange={(e) =>
                setTipe(e.target.value as "insiden" | "permintaan" | "internal")
              }
              className="w-full rounded border px-2 py-2 text-sm"
            >
              <option value="insiden">Insiden</option>
              <option value="permintaan">Permintaan</option>
              <option value="internal">Internal</option>
            </select>
            <select
              value={prioritas}
              onChange={(e) =>
                setPrioritas(e.target.value as "P0" | "P1" | "P2" | "P3")
              }
              className="rounded border px-2 py-2 text-sm"
            >
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={butuhAset}
              onChange={(e) => setButuhAset(e.target.checked)}
            />
            Wajib Aset
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={butuhFoto}
              onChange={(e) => setButuhFoto(e.target.checked)}
            />
            Wajib Foto
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={bisaRemote}
              onChange={(e) => setBisaRemote(e.target.checked)}
            />
            Bisa Remote
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={butuhApproval}
              onChange={(e) => setButuhApproval(e.target.checked)}
            />
            Perlu Approval GA
          </label>
          <button
            type="submit"
            disabled={creating}
            className="ml-auto rounded bg-black px-4 py-1.5 font-medium text-white disabled:opacity-50"
          >
            {creating ? "Menambah..." : "+ Tambah Kategori"}
          </button>
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-100">
            <tr>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Kelompok</th>
              <th className="px-4 py-3">Prioritas</th>
              <th className="px-4 py-3">Syarat</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((category) => (
              <tr
                key={category.id}
                className={category.aktif ? "" : "bg-gray-50 opacity-60"}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{category.nama}</div>
                  <div className="text-xs capitalize text-gray-500">
                    {category.tipe}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Kelompok ${category.nama}`}
                    value={category.grup}
                    disabled={loadingId !== null}
                    onChange={(e) =>
                      void patchCategory(category.id, { grup: e.target.value })
                    }
                    className="rounded border px-2 py-1 text-xs"
                  >
                    {Array.from(new Set([...DEFAULT_GROUPS, category.grup])).map(
                      (g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ),
                    )}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Prioritas ${category.nama}`}
                    value={category.prioritas_default}
                    disabled={loadingId !== null}
                    onChange={(e) =>
                      void patchCategory(category.id, {
                        prioritas_default: e.target.value,
                      })
                    }
                    className="rounded border px-2 py-1 text-xs font-bold"
                  >
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {(
                      [
                        ["butuh_aset", "Aset"],
                        ["butuh_foto", "Foto"],
                        ["bisa_remote", "Remote"],
                        ["butuh_approval", "Approval"],
                      ] as const
                    ).map(([flag, label]) => (
                      <button
                        key={flag}
                        type="button"
                        disabled={loadingId !== null}
                        onClick={() =>
                          void patchCategory(category.id, {
                            [flag]: !category[flag],
                          })
                        }
                        className={`rounded border px-2 py-0.5 ${
                          category[flag]
                            ? "border-blue-300 bg-blue-100 text-blue-800"
                            : "text-gray-500"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      void patchCategory(category.id, { aktif: !category.aktif })
                    }
                    disabled={loadingId !== null}
                    className={`rounded px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                      category.aktif
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    {loadingId === category.id
                      ? "Menyimpan..."
                      : category.aktif
                        ? "Nonaktifkan"
                        : "Aktifkan"}
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-600">
                  Belum ada kategori.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
