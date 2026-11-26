"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StockConsumeButton({
  ticketId,
  stockKode,
  stockNama,
  availableCount,
  satuan,
  alreadyConsumed,
}: {
  ticketId: string;
  stockKode: string;
  stockNama: string;
  availableCount: number;
  satuan: string;
  alreadyConsumed: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleConsume() {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const response = await fetch("/api/stok/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kode: stockKode,
          delta: -1,
          jenis: "keluar",
          ticketId,
          catatan: `Pemakaian sparepart untuk tiket`,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        result?: { stok_sesudah: number; satuan: string };
      };
      if (!response.ok) {
        setError(result.error ?? "Gagal mengurangi stok.");
        setLoading(false);
        return;
      }
      setSuccessMsg(
        `Stok dicatat keluar 1 ${result.result?.satuan ?? satuan}. Sisa stok: ${result.result?.stok_sesudah ?? availableCount - 1}.`,
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menghubungi layanan stok.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-emerald-950">
            Sparepart Terkait: {stockNama}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800 tabular-nums">
            Stok tersedia saat ini: <strong>{availableCount}</strong> {satuan}
            {alreadyConsumed
              ? " · Pemakaian stok untuk tiket ini sudah tercatat."
              : ""}
          </p>
        </div>
        {!alreadyConsumed && availableCount > 0 && (
          <button
            type="button"
            onClick={handleConsume}
            disabled={loading}
            className="min-h-9 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {loading
              ? "Memproses..."
              : `Ambil 1 ${satuan} & Catat Pemakaian`}
          </button>
        )}
      </div>
      {successMsg && <p className="mt-2 text-xs text-emerald-900">{successMsg}</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
