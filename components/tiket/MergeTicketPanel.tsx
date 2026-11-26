"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type MergeCandidate = {
  id: string;
  nomor_tiket: string;
  deskripsi: string;
  prioritas: string;
  pembuat: string;
};

export default function MergeTicketPanel({
  parentTicketId,
  candidates,
}: {
  parentTicketId: string;
  candidates: MergeCandidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function handleMerge() {
    if (selected.length === 0) return;
    if (
      !window.confirm(
        `Gabungkan ${selected.length} tiket ke tiket ini? Saat tiket ini selesai, tiket yang digabungkan otomatis ikut selesai.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/tiket/${encodeURIComponent(parentTicketId)}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childIds: selected }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        mergedCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Gagal menggabungkan tiket.");
      setNotice(`Berhasil menggabungkan ${data.mergedCount ?? selected.length} tiket.`);
      setSelected([]);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menggabungkan tiket.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded border p-5">
      <h2 className="font-medium">Gabungkan Tiket Serupa (Merge)</h2>
      <p className="text-xs text-gray-600">
        Pilih tiket aktif berkategori sama untuk digabungkan ke tiket induk ini:
      </p>
      <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-start gap-2 rounded border p-2">
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={() => toggle(c.id)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-gray-600">
                {c.nomor_tiket} · {c.prioritas} · {c.pembuat}
              </p>
              <p className="truncate text-xs">{c.deskripsi}</p>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy || selected.length === 0}
        onClick={() => void handleMerge()}
        className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? "Menggabungkan..." : `Gabungkan (${selected.length})`}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-green-700">
          {notice}
        </p>
      )}
    </section>
  );
}
