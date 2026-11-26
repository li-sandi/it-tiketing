"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ApprovalActions({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(keputusan: "disetujui" | "ditolak") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiket/${encodeURIComponent(ticketId)}/approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keputusan, catatan }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal memproses approval.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses approval.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-xs">
      <h3 className="text-sm font-semibold text-amber-950">
        Persetujuan GA / Admin
      </h3>
      <div>
        <label htmlFor="approval-note" className="mb-1 block text-xs font-medium text-amber-900">
          Catatan keputusan (opsional)
        </label>
        <input
          id="approval-note"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          maxLength={500}
          placeholder="Contoh: Disetujui pengadaan RAM 8GB"
          className="w-full rounded-lg border px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide("disetujui")}
          className="min-h-9 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Setujui
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide("ditolak")}
          className="min-h-9 rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          Tolak
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
