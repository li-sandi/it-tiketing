"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  changeTicketStatus,
  claimTicket,
} from "@/app/tiket/[id]/actions";
import { useToast } from "@/components/ui/ToastProvider";
import {
  getNextTicketStatuses,
  ticketStatusLabels,
  type TicketStatus,
} from "@/lib/tiket-status";

export default function TicketActions({
  ticketId,
  status,
  assigneeId,
  userId,
  role,
}: {
  ticketId: string;
  status: TicketStatus;
  assigneeId: string | null;
  userId: string;
  role: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [poinKesulitan, setPoinKesulitan] = useState("");
  const [catatanSolusi, setCatatanSolusi] = useState("");
  const isStaff = role === "it" || role === "admin";
  const canUpdate =
    role === "admin" || (role === "it" && assigneeId === userId);

  const { toast } = useToast();

  async function runAction(action: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await action();
    setError(result.error ?? null);
    setNotice(result.notice ?? null);
    if (result.error) {
      toast(result.error, "error");
    } else if (result.notice) {
      toast(result.notice, "success");
    }
    setBusy(false);
    router.refresh();
  }

  async function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!poinKesulitan) {
      setError("Pilih poin kesulitan.");
      return;
    }
    await runAction(() =>
      changeTicketStatus(ticketId, "selesai", {
        poinKesulitan: Number(poinKesulitan),
        catatanSolusi,
      }),
    );
  }

  return (
    <section className="space-y-3">
      {isStaff &&
        (status === "baru" || status === "menunggu_pengadaan") &&
        !assigneeId && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction(() => claimTicket(ticketId))}
            className="min-h-10 rounded-lg bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
          >
            {busy ? "Mengambil..." : "Ambil tiket"}
          </button>
        )}

      {status === "ditutup" && (
        <p className="text-sm text-[var(--muted)]">Tiket sudah ditutup.</p>
      )}

      {canUpdate && getNextTicketStatuses(status).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {getNextTicketStatuses(status).map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              disabled={busy}
              onClick={() => {
                if (nextStatus === "selesai") {
                  setError(null);
                  setCompletionOpen(true);
                  return;
                }
                void runAction(() => changeTicketStatus(ticketId, nextStatus));
              }}
              className="min-h-9 rounded-lg border bg-[var(--surface)] px-3.5 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              {busy
                ? "Memproses..."
                : `Ubah ke ${ticketStatusLabels[nextStatus]}`}
            </button>
          ))}
        </div>
      )}

      {canUpdate && completionOpen && status !== "selesai" && (
        <form
          onSubmit={submitCompletion}
          className="space-y-3 rounded-xl border bg-[var(--surface-muted)] p-4"
        >
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Catatan penyelesaian
          </h3>
          <div>
            <label
              htmlFor="difficulty-points"
              className="mb-1 block text-xs font-medium text-[var(--secondary)]"
            >
              Poin kesulitan (1-5)
            </label>
            <select
              id="difficulty-points"
              required
              value={poinKesulitan}
              onChange={(event) => setPoinKesulitan(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Pilih poin</option>
              {[1, 2, 3, 4, 5].map((point) => (
                <option key={point} value={point}>
                  {point}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="solution-note"
              className="mb-1 block text-xs font-medium text-[var(--secondary)]"
            >
              Catatan solusi
            </label>
            <textarea
              id="solution-note"
              required
              minLength={5}
              maxLength={5000}
              rows={4}
              value={catatanSolusi}
              onChange={(event) => setCatatanSolusi(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Selesaikan tiket"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCompletionOpen(false)}
              className="min-h-9 rounded-lg border bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      )}
    </section>
  );
}
