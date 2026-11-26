"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";

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
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function executeMerge() {
    if (selected.length === 0) return;
    setConfirmOpen(false);

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
      const okMsg = `Berhasil menggabungkan ${data.mergedCount ?? selected.length} tiket.`;
      setNotice(okMsg);
      toast(okMsg, "success");
      setSelected([]);
      router.refresh();
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Gagal menggabungkan tiket.";
      setError(errMsg);
      toast(errMsg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
      <ConfirmDialog
        open={confirmOpen}
        title="Gabungkan Tiket Serupa?"
        message={`Gabungkan ${selected.length} tiket ke tiket ini? Saat tiket ini selesai, tiket yang digabungkan otomatis ikut selesai.`}
        confirmLabel="Gabungkan Tiket"
        busy={busy}
        onConfirm={() => void executeMerge()}
        onCancel={() => setConfirmOpen(false)}
      />
      <h2 className="text-sm font-semibold text-[var(--foreground)]">
        Gabungkan Tiket Serupa (Merge)
      </h2>
      <p className="text-xs text-[var(--muted)]">
        Pilih tiket aktif berkategori sama untuk digabungkan ke tiket induk ini:
      </p>
      <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
        {candidates.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-[var(--surface-muted)] p-2.5">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs tabular-nums text-[var(--muted)]">
                  {c.nomor_tiket} · {c.prioritas} · {c.pembuat}
                </p>
                <p className="truncate text-xs text-[var(--foreground)]">
                  {c.deskripsi}
                </p>
              </div>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy || selected.length === 0}
        onClick={() => {
          if (selected.length > 0) setConfirmOpen(true);
        }}
        className="min-h-9 rounded-lg border bg-[var(--surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
      >
        {busy ? "Menggabungkan..." : `Gabungkan (${selected.length})`}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-emerald-700">
          {notice}
        </p>
      )}
    </section>
  );
}
