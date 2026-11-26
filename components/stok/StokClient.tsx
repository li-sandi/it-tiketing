"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  evaluateStockStatus,
  formatProcurementEstimate,
  getNextMonthProcurementDate,
  type InventoryStockItem,
} from "@/lib/stok";

type StockMovement = {
  id: string;
  jenis: "masuk" | "keluar" | "penyesuaian";
  perubahan: number;
  stok_sebelum: number;
  stok_sesudah: number;
  catatan: string | null;
  dibuat_pada: string;
  stock_id: string;
  ticket_id: string | null;
  inventory_stocks?: { kode: string; nama: string; satuan: string } | null;
  users?: { nama: string } | null;
  tickets?: { nomor_tiket: string } | null;
};

type PendingProcurementTicket = {
  id: string;
  nomor_tiket: string;
  stock_kode: string | null;
  estimasi_pengadaan: string | null;
  prioritas: string;
  dibuat_pada: string;
  categories?: { nama: string } | { nama: string }[] | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default function StokClient({
  initialStocks,
  initialMovements,
  pendingTickets,
  role,
}: {
  initialStocks: InventoryStockItem[];
  initialMovements: StockMovement[];
  pendingTickets: PendingProcurementTicket[];
  role: string;
}) {
  const router = useRouter();
  const [stocks, setStocks] = useState(initialStocks);
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyKode, setBusyKode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newKode, setNewKode] = useState("");
  const [newNama, setNewNama] = useState("");
  const [newSatuan, setNewSatuan] = useState("unit");
  const [newMin, setNewMin] = useState("2");
  const [creating, setCreating] = useState(false);

  const nextMonthLabel =
    formatProcurementEstimate(getNextMonthProcurementDate()) ?? "Bulan depan";

  async function handleAdjust(
    kode: string,
    jenis: "masuk" | "keluar",
  ) {
    setError(null);
    setFeedback(null);
    const raw = Number(deltas[kode] ?? "1");
    const qty = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 1;
    const delta = jenis === "masuk" ? qty : -qty;

    setBusyKode(kode);
    try {
      const response = await fetch("/api/stok/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kode,
          delta,
          jenis,
          catatan:
            notes[kode]?.trim() ||
            (jenis === "masuk"
              ? `Penambahan stok oleh ${role.toUpperCase()}`
              : `Pengurangan stok manual oleh ${role.toUpperCase()}`),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        result?: { nama: string; stok_sesudah: number; satuan: string };
        waitingProcurementCount?: number;
      };
      if (!response.ok) {
        setError(data.error ?? "Gagal memperbarui stok.");
        setBusyKode(null);
        return;
      }

      setStocks((prev) =>
        prev.map((item) =>
          item.kode === kode
            ? {
                ...item,
                jumlah_stok: data.result?.stok_sesudah ?? item.jumlah_stok + delta,
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      setDeltas((prev) => ({ ...prev, [kode]: "" }));
      setNotes((prev) => ({ ...prev, [kode]: "" }));

      const waitingNotice =
        data.waitingProcurementCount && data.waitingProcurementCount > 0
          ? ` Ada ${data.waitingProcurementCount} tiket menunggu pengadaan untuk item ini — silakan tinjau dan ambil di Antrian.`
          : "";
      setFeedback(
        `Stok ${data.result?.nama ?? kode} diperbarui menjadi ${data.result?.stok_sesudah ?? "-"} ${data.result?.satuan ?? ""}.${waitingNotice}`,
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Tidak dapat menghubungi server.",
      );
    } finally {
      setBusyKode(null);
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setCreating(true);
    try {
      const response = await fetch("/api/stok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kode: newKode,
          nama: newNama,
          satuan: newSatuan,
          stokMinimum: Number(newMin || "2"),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        stock?: InventoryStockItem;
      };
      if (!response.ok || !data.stock) {
        setError(data.error ?? "Gagal menambah item stok.");
        setCreating(false);
        return;
      }
      setStocks((prev) => [...prev, data.stock!]);
      setNewKode("");
      setNewNama("");
      setNewSatuan("unit");
      setNewMin("2");
      setFeedback(`Item sparepart "${data.stock.nama}" ditambahkan.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan item.");
    } finally {
      setCreating(false);
    }
  }

  const outOfStockCount = stocks.filter((s) => s.jumlah_stok <= 0).length;
  const lowStockCount = stocks.filter(
    (s) => evaluateStockStatus(s.jumlah_stok, s.stok_minimum) === "menipis",
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 shadow-xs">
        <p className="font-semibold">
          Alur Otomatis Stok Sparepart &amp; Pengadaan Bulanan
        </p>
        <p className="mt-1 text-xs text-blue-900">
          Jika user membuat tiket terkait RAM, Headset, Mouse, Kabel Power, atau
          Charger Laptop saat stok &gt; 0, tiket langsung masuk antrian{" "}
          <strong>Baru</strong> agar IT dapat segera mengambil tindakan. Jika
          stok <strong>0 (Habis)</strong>, tiket otomatis berstatus{" "}
          <strong>Menunggu Pengadaan</strong> dengan estimasi{" "}
          <strong>{nextMonthLabel}</strong> dan SLA dijeda sampai pengadaan
          tersedia.
        </p>
        <p className="mt-1 text-xs text-blue-800">
          Pengisian stok dikelola oleh <strong>GA</strong> (dan sementara ini{" "}
          <strong>IT / Admin</strong> juga memiliki akses penuh mengisi &amp;
          menyesuaikan stok).
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
          <p className="text-xs font-medium text-[var(--muted)]">Total Jenis Sparepart</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {stocks.length}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-xs">
          <p className="text-xs font-medium text-amber-800">Stok Menipis</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-900">
            {lowStockCount}
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-xs">
          <p className="text-xs font-medium text-red-800">
            Stok Kosong (Auto-Pengadaan)
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-red-900">
            {outOfStockCount}
          </p>
        </div>
      </section>

      {feedback && (
        <p
          role="status"
          className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {feedback}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <section className="overflow-x-auto rounded-xl border bg-[var(--surface)] shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Sparepart</th>
              <th className="px-4 py-3 font-medium">Stok</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Update Stok</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stocks.map((item) => {
              const status = evaluateStockStatus(
                item.jumlah_stok,
                item.stok_minimum,
              );
              const badgeClass =
                status === "habis"
                  ? "bg-red-100 text-red-800"
                  : status === "menipis"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800";
              const statusLabel =
                status === "habis"
                  ? "Kosong"
                  : status === "menipis"
                    ? "Menipis"
                    : "Tersedia";

              return (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.nama}</p>
                    <p className="font-mono text-xs text-gray-500">
                      {item.kode} · Min {item.stok_minimum} {item.satuan}
                    </p>
                    {item.catatan && (
                      <p className="text-xs text-gray-500">{item.catatan}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {item.jumlah_stok} {item.satuan}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        placeholder="1"
                        aria-label={`Jumlah perubahan ${item.nama}`}
                        value={deltas[item.kode] ?? ""}
                        onChange={(e) =>
                          setDeltas((prev) => ({
                            ...prev,
                            [item.kode]: e.target.value,
                          }))
                        }
                        className="w-16 rounded border px-2 py-1 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Catatan (opsional)"
                        aria-label={`Catatan ${item.nama}`}
                        value={notes[item.kode] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({
                            ...prev,
                            [item.kode]: e.target.value,
                          }))
                        }
                        className="w-40 rounded border px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        disabled={busyKode === item.kode}
                        onClick={() => handleAdjust(item.kode, "masuk")}
                        className="rounded bg-black px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        + Tambah
                      </button>
                      <button
                        type="button"
                        disabled={
                          busyKode === item.kode || item.jumlah_stok <= 0
                        }
                        onClick={() => handleAdjust(item.kode, "keluar")}
                        className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                      >
                        - Kurangi
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {pendingTickets.length > 0 && (
        <section className="rounded border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-base font-semibold text-amber-950">
            Tiket Menunggu Pengadaan Bulan Depan ({pendingTickets.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {pendingTickets.map((t) => {
              const catName = Array.isArray(t.categories)
                ? t.categories[0]?.nama
                : t.categories?.nama;
              return (
                <li key={t.id}>
                  <Link
                    href={`/tiket/${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white px-3 py-2 hover:bg-amber-50/50"
                  >
                    <span>
                      <strong className="font-mono text-xs">
                        {t.nomor_tiket}
                      </strong>{" "}
                      · {catName ?? "-"} ({t.stock_kode ?? "sparepart"})
                    </span>
                    <span className="text-xs text-amber-900">
                      Est.{" "}
                      {formatProcurementEstimate(t.estimasi_pengadaan) ??
                        "Bulan depan"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleCreateItem}
          className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs"
        >
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Tambah Jenis Sparepart Baru
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="stok-kode" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Kode Unik (huruf kecil / underscore)
              </label>
              <input
                id="stok-kode"
                value={newKode}
                onChange={(e) => setNewKode(e.target.value)}
                placeholder="ssd_nvme"
                required
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="stok-nama" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Nama Sparepart
              </label>
              <input
                id="stok-nama"
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
                placeholder="SSD NVMe 512GB"
                required
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="stok-satuan" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Satuan
              </label>
              <input
                id="stok-satuan"
                value={newSatuan}
                onChange={(e) => setNewSatuan(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="stok-min" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Batas Minimum
              </label>
              <input
                id="stok-min"
                type="number"
                min={0}
                value={newMin}
                onChange={(e) => setNewMin(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-1.5 text-sm tabular-nums"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
          >
            {creating ? "Menyimpan..." : "Simpan Item Sparepart"}
          </button>
        </form>

        <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <h2 className="mb-3 text-base font-semibold text-[var(--foreground)]">
            Riwayat Mutasi Stok Terbaru
          </h2>
          {initialMovements.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Belum ada mutasi stok tercatat.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
              {initialMovements.map((m) => (
                <li key={m.id} className="rounded-lg border bg-[var(--surface-muted)] p-2.5">
                  <div className="flex items-center justify-between gap-2 font-medium text-[var(--foreground)]">
                    <span>
                      {m.inventory_stocks?.nama ?? "Sparepart"} (
                      {m.perubahan > 0 ? `+${m.perubahan}` : m.perubahan})
                    </span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {m.stok_sebelum} ke {m.stok_sesudah}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[var(--muted)]">
                    {m.users?.nama ?? "Sistem"} · {formatDate(m.dibuat_pada)}
                    {m.tickets?.nomor_tiket ? ` · ${m.tickets.nomor_tiket}` : ""}
                  </p>
                  {m.catatan && <p className="text-[var(--secondary)]">{m.catatan}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
