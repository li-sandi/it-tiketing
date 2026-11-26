"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Article = {
  id: string;
  judul: string;
  grup: string;
  masalah: string;
  solusi: string;
  kata_kunci: string[];
  status: "draft" | "published";
  diperbarui_pada: string;
};

const GROUPS = [
  "Network & VPN",
  "Hardware & Periferal",
  "Software & Aplikasi",
  "Laptop Lifecycle & Performa",
  "Akses & Keamanan",
  "Internal IT",
  "Lainnya",
];

export default function WikiClient({
  initialArticles,
  isStaff,
}: {
  initialArticles: Article[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("Semua");

  const [judul, setJudul] = useState("");
  const [grup, setGrup] = useState("Software & Aplikasi");
  const [masalah, setMasalah] = useState("");
  const [solusi, setSolusi] = useState("");
  const [kataKunci, setKataKunci] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = initialArticles.filter((a) => {
    if (groupFilter !== "Semua" && a.grup !== groupFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        a.judul.toLowerCase().includes(q) ||
        a.masalah.toLowerCase().includes(q) ||
        a.solusi.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul,
          grup,
          masalah,
          solusi,
          kata_kunci: kataKunci,
          status,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal menambah artikel.");
      setJudul("");
      setMasalah("");
      setSolusi("");
      setKataKunci("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah artikel.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(article: Article) {
    setBusy(true);
    setError(null);
    try {
      const nextStatus = article.status === "published" ? "draft" : "published";
      const res = await fetch(`/api/wiki/${encodeURIComponent(article.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal memperbarui artikel.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui artikel.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArticle(id: string) {
    if (!window.confirm("Hapus artikel SOP ini?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal menghapus artikel.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus artikel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
        <input
          aria-label="Cari artikel SOP"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari SOP atau gejala masalah..."
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <select
          aria-label="Filter kelompok artikel"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="Semua">Semua Kelompok</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      {isStaff && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs"
        >
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Tulis Artikel Wiki / SOP Baru
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              aria-label="Judul SOP"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Judul SOP"
              required
              className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
            />
            <select
              aria-label="Kelompok SOP"
              value={grup}
              onChange={(e) => setGrup(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <textarea
            aria-label="Gejala atau masalah"
            value={masalah}
            onChange={(e) => setMasalah(e.target.value)}
            placeholder="Gejala / masalah yang dialami pengguna"
            required
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <textarea
            aria-label="Langkah penyelesaian"
            value={solusi}
            onChange={(e) => setSolusi(e.target.value)}
            placeholder="Langkah penyelesaian / cek mandiri"
            required
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              aria-label="Kata kunci"
              value={kataKunci}
              onChange={(e) => setKataKunci(e.target.value)}
              placeholder="Kata kunci (pisahkan koma)"
              className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
            />
            <select
              aria-label="Status penerbitan"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value === "draft" ? "draft" : "published")
              }
              className="rounded-lg border px-3 py-1.5 text-sm"
            >
              <option value="published">Terbitkan</option>
              <option value="draft">Simpan sebagai Draf</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
            >
              Simpan Artikel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {visible.map((article) => (
          <article key={article.id} className="space-y-2.5 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                  {article.grup}
                </span>
                {article.status === "draft" && (
                  <span className="ml-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Draf
                  </span>
                )}
                <h3 className="mt-1.5 text-base font-semibold text-[var(--foreground)]">
                  {article.judul}
                </h3>
              </div>
              {isStaff && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void togglePublish(article)}
                    className="rounded-lg border bg-[var(--surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-muted)]"
                  >
                    {article.status === "published" ? "Jadikan Draf" : "Terbitkan"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteArticle(article.id)}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--secondary)]">
              <strong className="text-[var(--foreground)]">Masalah:</strong> {article.masalah}
            </p>
            <div className="rounded-lg border bg-[var(--surface-muted)] p-3.5 text-sm whitespace-pre-wrap text-[var(--foreground)]">
              {article.solusi}
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <p className="rounded-xl border bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
            Belum ada artikel SOP yang cocok.
          </p>
        )}
      </div>
    </div>
  );
}
