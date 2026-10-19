"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Category = {
  id: string;
  nama: string;
  tipe: string;
  prioritas_default: string;
  aktif: boolean;
};

export default function KategoriTable({
  categories,
}: {
  categories: Category[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleAktif(category: Category) {
    setLoadingId(category.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/kategori/${encodeURIComponent(category.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aktif: !category.aktif }),
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

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-100">
            <tr>
              <th className="px-4 py-3">Nama Kategori</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Prioritas</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((category) => (
              <tr
                key={category.id}
                className={category.aktif ? "" : "bg-gray-50 opacity-60"}
              >
                <td className="px-4 py-3 font-medium">{category.nama}</td>
                <td className="px-4 py-3 capitalize">{category.tipe}</td>
                <td className="px-4 py-3 font-bold">
                  {category.prioritas_default}
                </td>
                <td className="px-4 py-3">
                  {category.aktif ? "Aktif" : "Nonaktif"}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleAktif(category)}
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
