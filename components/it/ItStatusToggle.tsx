"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_LABELS: Record<string, string> = {
  free: "Free (Siap Terima Tiket)",
  sibuk: "Sibuk (Otomatis)",
  off: "Off (Tidak Aktif)",
  kunjungan: "Kunjungan",
};

export default function ItStatusToggle({
  initialStatus,
}: {
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(next: "free" | "off" | "kunjungan") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/it/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok || !data.status) {
        throw new Error(data.error ?? "Gagal mengubah status IT.");
      }
      setStatus(data.status);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status IT.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 text-xs shadow-xs">
      <span className="font-medium text-[var(--muted)]">Status IT saya:</span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${
            status === "free"
              ? "bg-emerald-600"
              : status === "off"
                ? "bg-slate-400"
                : "bg-amber-600"
          }`}
        />
        {STATUS_LABELS[status] ?? status}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy || status === "free"}
          onClick={() => void changeStatus("free")}
          className="rounded-lg border bg-[var(--surface)] px-2.5 py-1 font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
        >
          Set Free
        </button>
        <button
          type="button"
          disabled={busy || status === "off"}
          onClick={() => void changeStatus("off")}
          className="rounded-lg border bg-[var(--surface)] px-2.5 py-1 font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
        >
          Set Off
        </button>
      </div>
      {error && (
        <span role="alert" className="text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
