"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  changeTicketStatus,
  claimTicket,
} from "@/app/tiket/[id]/actions";
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

  async function runAction(action: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await action();
    setError(result.error ?? null);
    setNotice(result.notice ?? null);
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
      {isStaff && status === "baru" && !assigneeId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction(() => claimTicket(ticketId))}
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Mengambil..." : "Ambil tiket"}
        </button>
      )}

      {status === "ditutup" && (
        <p className="text-sm text-gray-500">Tiket sudah ditutup.</p>
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
              className="rounded border px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              {busy
                ? "Memproses..."
                : `→ ${ticketStatusLabels[nextStatus]}`}
            </button>
          ))}
        </div>
      )}

      {canUpdate && completionOpen && status !== "selesai" && (
        <form
          onSubmit={submitCompletion}
          className="space-y-3 rounded border bg-gray-50 p-4"
        >
          <h3 className="font-medium">Catatan penyelesaian</h3>
          <div>
            <label
              htmlFor="difficulty-points"
              className="mb-1 block text-sm font-medium"
            >
              Poin kesulitan (1–5)
            </label>
            <select
              id="difficulty-points"
              required
              value={poinKesulitan}
              onChange={(event) => setPoinKesulitan(event.target.value)}
              disabled={busy}
              className="w-full rounded border bg-white px-3 py-2"
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
              className="mb-1 block text-sm font-medium"
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
              className="w-full rounded border bg-white px-3 py-2"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Selesaikan tiket"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCompletionOpen(false)}
              className="rounded border px-4 py-2 disabled:opacity-50"
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
