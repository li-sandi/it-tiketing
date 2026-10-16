"use client";

import { useState } from "react";
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
              onClick={() =>
                void runAction(() => changeTicketStatus(ticketId, nextStatus))
              }
              className="rounded border px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              {busy
                ? "Memproses..."
                : `→ ${ticketStatusLabels[nextStatus]}`}
            </button>
          ))}
        </div>
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
